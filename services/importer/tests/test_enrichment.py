import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import requests
import enrichment
import app as service
import test_app

class EnrichmentTests(unittest.TestCase):
    def test_cover_404_falls_back_and_decodes_to_a_local_jpeg(self):
        missing=Mock(status_code=404,headers={})
        image=Mock(status_code=200,headers={"Content-Type":"image/jpeg"});image.iter_content.return_value=[b"image bytes"]
        def convert(arguments,timeout):
            if arguments[0]=='ffprobe':return '{"streams":[{"width":600,"height":600}]}'
            Path(arguments[-1]).write_bytes(b'local jpeg');return ''
        with tempfile.TemporaryDirectory() as tmp,patch.object(enrichment.requests,'get',side_effect=[missing,image]) as fetch:
            cover,status=enrichment.prepare_artwork(Path(tmp),'abcdefghijk','https://lh3.googleusercontent.com/missing',{},convert)
            self.assertEqual(status,'ready');self.assertEqual(cover.name,'cover.jpg');self.assertEqual(cover.read_bytes(),b'local jpeg')
            self.assertEqual(fetch.call_args_list[1].args[0],'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg')
            missing.close.assert_called();image.close.assert_called()

    def test_untrusted_hosts_redirects_and_oversized_images_are_not_accepted(self):
        for url in ['http://i.ytimg.com/a','https://attacker.example/a','https://i.ytimg.com.attacker.example/a','https://user:pass@i.ytimg.com/a','https://i.ytimg.com:444/a']:
            self.assertFalse(enrichment.trusted_image_url(url))
        redirect=Mock(status_code=302,headers={'Location':'http://127.0.0.1/private'})
        not_found=Mock(status_code=404,headers={})
        with tempfile.TemporaryDirectory() as tmp,patch.object(enrichment.requests,'get',side_effect=[redirect,not_found,not_found,not_found]) as fetch:
            cover,status=enrichment.prepare_artwork(Path(tmp),'abcdefghijk','https://lh3.googleusercontent.com/a',{},Mock())
            self.assertIsNone(cover);self.assertTrue(all('127.0.0.1' not in call.args[0] for call in fetch.call_args_list))
        huge=Mock(status_code=200,headers={'Content-Type':'image/png'});huge.iter_content.return_value=[b'x'*(enrichment.MAX_IMAGE_BYTES+1)]
        with tempfile.TemporaryDirectory() as tmp,patch.object(enrichment.requests,'get',return_value=huge),patch.object(enrichment,'MAX_IMAGE_BYTES',100):
            self.assertIsNone(enrichment.prepare_artwork(Path(tmp),'abcdefghijk',None,{},Mock())[0])

    def test_exact_lyrics_keep_timing_and_source_and_skip_fallback(self):
        response=Mock(status_code=200);response.json.return_value={'id':123,'trackName':'Song','artistName':'Artist','albumName':'Album','duration':120,'plainLyrics':'Example text','syncedLyrics':'[00:01]Example text'}
        fallback=Mock()
        with patch.object(enrichment.requests,'get',return_value=response):
            result=enrichment.lyrics_for_song({'title':'Song','artist':'Artist','album':'Album','duration':120},'abcdefghijk',fallback)
        self.assertEqual(result['lyricsStatus'],'ready');self.assertEqual(result['syncedLyrics'],'[00:01]Example text');self.assertEqual(result['lyricsSourceUrl'],'https://lrclib.net/api/get/123');fallback.assert_not_called()

    def test_wrong_recording_is_rejected_and_youtube_music_is_used(self):
        response=Mock(status_code=200);response.json.return_value={'trackName':'Song','artistName':'Wrong artist','duration':120,'plainLyrics':'Wrong words'}
        with patch.object(enrichment.requests,'get',return_value=response):
            result=enrichment.lyrics_for_song({'title':'Song','artist':'Artist','duration':120},'abcdefghijk',lambda _: {'lyrics':'Correct words','source':'YouTube Music'})
        self.assertEqual(result['plainLyrics'],'Correct words');self.assertIn('music.youtube.com',result['lyricsSourceUrl'])

    def test_missing_instrumental_and_network_failure_are_distinct(self):
        metadata={'title':'Song','artist':'Artist','duration':120}
        response=Mock(status_code=404)
        with patch.object(enrichment.requests,'get',return_value=response):
            self.assertEqual(enrichment.lyrics_for_song(metadata,'abcdefghijk',lambda _: {})['lyricsStatus'],'missing')
        with patch.object(enrichment.requests,'get',side_effect=requests.ConnectionError()):
            self.assertEqual(enrichment.lyrics_for_song(metadata,'abcdefghijk',lambda _: {})['lyricsStatus'],'failed')
        response=Mock(status_code=200);response.json.return_value={'id':1,'trackName':'Song','artistName':'Artist','duration':120,'instrumental':True}
        with patch.object(enrichment.requests,'get',return_value=response):
            self.assertEqual(enrichment.lyrics_for_song(metadata,'abcdefghijk',Mock())['lyricsStatus'],'instrumental')

class ImportEnrichmentTests(unittest.TestCase):
    setUp = test_app.MusicTests.setUp
    tearDown = test_app.MusicTests.tearDown
    @patch.object(service,'enrich_song',return_value={'artworkStatus':'ready','artworkUploaded':True,'lyricsStatus':'ready','plainLyrics':'Saved text'})
    @patch.object(service,'upload_file')
    @patch.object(service,'prepare_audio')
    @patch.object(service,'callback')
    def test_successful_audio_import_sends_enrichment_to_d1(self,callback,prepare,upload,enrich):
        callback.return_value={'status':'queued','title':'Song','artist':'Artist','album':'Album'}
        def audio(directory,video):
            path=directory/'track.m4a';path.write_bytes(b'audio');(directory/'source.info.json').write_text('{}');return path,{'status':'ready','title':'Song','duration':120}
        prepare.side_effect=audio
        result=self.client.post('/process',json=self.job,headers=self.headers)
        self.assertEqual(result.status_code,200);self.assertEqual(callback.call_args.args[2]['enrichment']['plainLyrics'],'Saved text');self.assertEqual(upload.call_args.args[2],'/upload')

    @patch.object(service,'enrich_song',return_value={'artworkStatus':'missing','lyricsStatus':'missing'})
    @patch.object(service,'run',return_value='{}')
    @patch.object(service,'prepare_audio')
    @patch.object(service,'callback')
    def test_repair_only_job_never_downloads_audio(self,callback,prepare,run,enrich):
        callback.return_value={'status':'ready','title':'Song','artist':'Artist','needArtwork':True,'needLyrics':True}
        result=self.client.post('/process',json={**self.job,'enrichOnly':True},headers=self.headers)
        self.assertEqual(result.status_code,200);prepare.assert_not_called();self.assertEqual(callback.call_args.kwargs['suffix'],'/enrichment')

    @patch.object(service,'prepare_artwork',return_value=(None,'missing'))
    @patch.object(service,'lyrics_for_song',return_value={'lyricsStatus':'missing'})
    def test_unavailable_artwork_and_lyrics_do_not_raise(self,lyrics,artwork):
        result=service.enrich_song(Path('.'),service.Job(**self.job),{}, {'duration':120},{})
        self.assertEqual(result,{'duration':120,'artworkStatus':'missing','lyricsStatus':'missing'})

if __name__=='__main__':unittest.main()
