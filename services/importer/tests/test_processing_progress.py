"""Exercise the import processing path without loading optional cloud SDKs."""
import ast
import json
from pathlib import Path
from types import SimpleNamespace
import subprocess
import tempfile
import unittest
from unittest.mock import Mock
from import_progress import ImportProgress

class ProcessingProgressTests(unittest.TestCase):
    def test_processing_reports_work_then_finalizes_without_claiming_100(self):
        tree=ast.parse((Path(__file__).parents[1]/'app.py').read_text(encoding='utf-8-sig'))
        nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ('process','enrich_song')]
        for node in nodes:
            node.decorator_list=[]
            for arg in node.args.args:arg.annotation=None
            node.args.defaults=[ast.Constant('0') if isinstance(value,ast.Call) and isinstance(value.func,ast.Name) and value.func.id=='Header' else value for value in node.args.defaults]
        calls=[]
        def callback(job,method='GET',data=None,**kwargs):
            if method=='GET':return {'status':'queued','title':'Song','artist':'Artist','album':'Album'}
            calls.append(data);return {'ok':True}
        def prepare(directory,video,progress):
            progress.download_line('KM_PROGRESS:50:100:NA');progress.report(80,'preparing')
            audio=directory/'track.m4a';audio.write_bytes(b'audio');(directory/'source.info.json').write_text('{}')
            return audio,{'status':'ready','title':'Song','duration':120}
        scope={'check_job':Mock(),'callback':callback,'tempfile':tempfile,'Path':Path,'json':json,'prepare_audio':prepare,'upload_file':Mock(),'ImportProgress':ImportProgress,'prepare_artwork':Mock(return_value=(None,'missing')),'lyrics_for_song':Mock(return_value={'lyricsStatus':'ready','plainLyrics':'Saved lyrics'}),'youtube_lyrics':Mock(),'run':Mock(),'downloader':Mock(),'youtube_cookie_arguments':Mock(),'subprocess':subprocess,'requests':SimpleNamespace(RequestException=ConnectionError)}
        exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'<processing-progress>','exec'),scope)
        job=SimpleNamespace(id='job',videoId='abcdefghijk',enrichOnly=False)
        self.assertEqual(scope['process'](job),{'ok':True})
        updates=[data for data in calls if 'progress' in data]
        self.assertEqual([data['stage'] for data in updates],['starting','downloading','preparing','uploading','artwork','lyrics','saving'])
        self.assertLess(max(data['progress'] for data in updates),100)
        self.assertEqual(calls[-1]['status'],'ready');self.assertEqual(calls[-1]['enrichment']['plainLyrics'],'Saved lyrics')
        self.assertEqual(calls[-1]['title'],'Song')

if __name__=='__main__':unittest.main()
