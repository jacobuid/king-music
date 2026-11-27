"""Search failover tests without loading optional cloud SDK binaries."""
import ast
import json
import logging
from pathlib import Path
import re
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import MagicMock,Mock
import unicodedata
from urllib.parse import urlparse

class UpstreamError(Exception):pass
class HttpError(Exception):
    def __init__(self,status,detail):self.status_code=status;super().__init__(detail)

class SearchFallbackTests(unittest.TestCase):
    def setUp(self):
        tree=ast.parse((Path(__file__).parents[1]/'app.py').read_text(encoding='utf-8-sig'))
        names={'music_result','search_text','search_score','ranked_music_results','youtube_search','youtube_page_search','search'}
        nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names]
        for node in nodes:
            node.decorator_list=[]
            for arg in node.args.args:arg.annotation=None
        self.source=Mock();self.run=Mock();self.cookies=Mock(return_value=['--cookies','/tmp/session'])
        self.scope={'json':json,'Path':Path,'re':re,'tempfile':tempfile,'unicodedata':unicodedata,'urlparse':urlparse,'VIDEO':re.compile(r'^[A-Za-z0-9_-]{11}$'),'UNWANTED_VARIANTS':('cover','karaoke','reaction','live'),'OFFICIAL_VIDEO_TYPES':{'MUSIC_VIDEO_TYPE_ATV','MUSIC_VIDEO_TYPE_OMV'},'MusicSession':MagicMock(),'YTMusic':Mock(return_value=self.source),'YTMusicError':UpstreamError,'requests':SimpleNamespace(RequestException=UpstreamError,get=Mock(side_effect=UpstreamError('blocked'))),'HTTPException':HttpError,'run':self.run,'downloader':lambda *args:['yt-dlp',*args],'youtube_cookie_arguments':self.cookies,'logging':logging,'subprocess':SimpleNamespace(TimeoutExpired=TimeoutError)}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<search-fallback>','exec'),self.scope)

    def test_non_json_music_response_falls_back_to_metadata_only_search(self):
        self.source.search.side_effect=ValueError('HTML instead of JSON')
        self.run.return_value=json.dumps({'entries':[{'id':'abcdefghijk','title':'Light up the Sky','channel':'The Afters','duration':219,'thumbnails':[{'url':'https://i.ytimg.com/art.jpg'}]},{'id':'abcdefghijk','title':'duplicate','duration':219},{'id':'ABCDEFGHIJK','title':'Too long','duration':7200},{'id':'invalid','title':'bad','duration':200}]})
        result=self.scope['search'](SimpleNamespace(query='the afters'))
        self.assertEqual(len(result['results']),1);self.assertEqual(result['results'][0]['artist'],'The Afters')
        command=self.run.call_args.args[0]
        self.assertIn('--flat-playlist',command);self.assertIn('--dump-single-json',command);self.assertEqual(command[-2:],['--','ytsearch12:the afters'])
        self.assertNotIn('--write-info-json',command);self.assertEqual(self.run.call_args.kwargs['timeout'],40)

    def test_search_page_recovers_results_without_an_api_post(self):
        self.source.search.side_effect=ValueError('API returned HTML')
        renderer={'videoRenderer':{'videoId':'8LQH6UDi15s','title':{'runs':[{'text':'Light Up The Sky'}]},'ownerText':{'runs':[{'text':'The Afters'}]},'lengthText':{'simpleText':'3:41'},'thumbnail':{'thumbnails':[{'url':'https://i.ytimg.com/cover.jpg'}]}}}
        html='<script>var ytInitialData = '+json.dumps({'contents':[renderer]})+';</script>'
        self.scope['requests'].get.side_effect=None
        self.scope['requests'].get.return_value=SimpleNamespace(text=html,content=html.encode(),raise_for_status=lambda:None)
        result=self.scope['search'](SimpleNamespace(query='the afters'))
        self.assertEqual(result['results'][0]['videoId'],'8LQH6UDi15s');self.assertEqual(result['results'][0]['duration'],221)
        self.run.assert_not_called()

    def test_video_failure_preserves_structured_song_matches(self):
        self.source.search.side_effect=[[{'videoId':'abcdefghijk','title':'Song','duration_seconds':120,'artists':[{'name':'Artist'}]}],ValueError('video API unavailable')]
        result=self.scope['search'](SimpleNamespace(query='Song'))
        self.assertEqual(result['results'][0]['title'],'Song');self.run.assert_not_called()

    def test_both_sources_failing_reports_error_instead_of_empty_matches(self):
        self.source.search.side_effect=ValueError('HTML')
        self.run.side_effect=RuntimeError('unavailable')
        with self.assertRaises(HttpError) as error:self.scope['search'](SimpleNamespace(query='Song'))
        self.assertEqual(error.exception.status_code,502)

if __name__=='__main__':unittest.main()
