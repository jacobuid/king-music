"""Provider identity matching tests without loading optional cloud SDK binaries."""
import ast
from pathlib import Path
import re
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock

class LookupError(Exception):
    def __init__(self, status, detail):
        self.status_code = status
        super().__init__(detail)

class ProviderError(Exception):
    pass

class CollectionDetailsTests(unittest.TestCase):
    def setUp(self):
        source = ast.parse((Path(__file__).parents[1] / 'app.py').read_text(encoding='utf-8-sig'))
        node = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'collection_details')
        node.decorator_list = []
        node.args.args[0].annotation = None
        self.client = Mock()
        scope = {'VIDEO': re.compile(r'^[A-Za-z0-9_-]{11}$'), 'HTTPException': LookupError, 'MusicSession': MagicMock(), 'YTMusic': Mock(return_value=self.client), 'search_text': lambda value: ' '.join(re.findall('[a-z0-9]+', str(value or '').lower())), 're': re, 'YTMusicError': ProviderError, 'requests': SimpleNamespace(RequestException=ProviderError)}
        exec(compile(ast.Module(body=[node], type_ignores=[]), '<collection-details>', 'exec'), scope)
        self.lookup = scope['collection_details']
        self.body = SimpleNamespace(kind='artist', artist='Cadet', album='', videoIds=['abcdefghijk'])
        self.track = {'videoId':'abcdefghijk', 'artists':[{'name':'Cadet','id':'UCabcdefghijk'}], 'album':{'name':'The Observatory','id':'MPRE_album1'}}
        self.client.get_watch_playlist.return_value = {'tracks':[self.track]}

    def test_artist_biography_comes_from_the_exact_imported_song_artist(self):
        self.client.get_artist.return_value = {'name':'Cadet','description':'Verified artist biography'}
        result = self.lookup(self.body)
        self.assertEqual(result['description'], 'Verified artist biography')
        self.assertEqual(result['sourceUrl'], 'https://music.youtube.com/channel/UCabcdefghijk')
        self.client.get_artist_albums.assert_not_called()

    def test_different_artist_is_not_attached(self):
        self.client.get_artist.return_value = {'name':'Different artist','description':'Wrong biography'}
        self.assertIsNone(self.lookup(self.body)['description'])

    def test_album_description_requires_matching_title_and_artist(self):
        self.body.kind = 'album'
        self.body.album = 'The Observatory'
        self.client.get_album.return_value = {'title':'The Observatory','artists':[{'name':'Cadet'}],'year':'2002','description':'Verified album description'}
        result = self.lookup(self.body)
        self.assertEqual(result['year'], '2002')
        self.assertEqual(result['description'], 'Verified album description')
        self.client.get_album.return_value['artists'] = [{'name':'Other artist'}]
        self.assertIsNone(self.lookup(self.body)['description'])

    def test_unavailable_provider_is_reported_without_fabricated_details(self):
        self.client.get_watch_playlist.side_effect = ProviderError()
        with self.assertRaises(LookupError) as error:
            self.lookup(self.body)
        self.assertEqual(error.exception.status_code, 502)

if __name__ == '__main__':
    unittest.main()
