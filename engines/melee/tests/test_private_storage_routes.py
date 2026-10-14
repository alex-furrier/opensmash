"""Local browser source storage routes; no disc or game runtime is required."""
import hashlib, importlib.util, json, subprocess, sys, tempfile, threading, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.request import urlopen, Request
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from opensmash_melee.character_import import ImportManager
ROOT=Path(__file__).resolve().parents[1]
class PrivateStorageRoutesTests(unittest.TestCase):
 def test_cli_exposes_optional_storage_roots(self):
  help_text=subprocess.check_output([sys.executable,str(ROOT/'tools/serve_melee.py'),'--help'],text=True)
  for flag in ['--private-source-root','--import-cache-root','--source-cache-root']:self.assertIn(flag,help_text)
 def test_configured_source_portrait_and_revision_routes_use_private_roots(self):
  spec=importlib.util.spec_from_file_location('private_storage_server',ROOT/'tools/serve_melee.py');server_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(server_module)
  self.assertEqual(server_module.SOURCE_CACHE_ROOT,ROOT/'build/native-fit/local/revisions');self.assertFalse(server_module.SOURCE_CACHE_CUSTOM)
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);manager=ImportManager({},threading.Lock(),workspace=root/'code',source_root=root/'private/sources',cache_root=root/'private/imports')
   slug='import-'+'a'*24;row=dict(slug=slug,name='Source Person',target='mario',imported=True);ident='web-v1-'+hashlib.sha256(slug.encode()).hexdigest()[:16];source=manager.source_root/ident;source.mkdir(parents=True)
   for name in ['rigged.glb','portrait_raw.png','stock_raw.png','emblem_raw.png','announcer.wav']:(source/name).write_bytes(name.encode())
   (manager.root/(slug+'.webp')).write_bytes(b'private portrait');manager.rows=[row];manager.private_rows=[row]
   cache=root/'private/revisions';prepared=cache/('b'*64)/'sources';prepared.mkdir(parents=True);(prepared/'person.json').write_bytes(b'{"private":true}')
   server_module.CATALOG={slug:row};server_module.IMPORTS=manager;server_module.SOURCE_CACHE_ROOT=cache;server_module.SOURCE_CACHE_CUSTOM=True;server_module.TOKEN='';server_module.SETUP=SimpleNamespace(ready=True)
   class Quiet(server_module.Handler):
    def log_message(self,*args):pass
   server=ThreadingHTTPServer(('127.0.0.1',0),Quiet);thread=threading.Thread(target=server.serve_forever);thread.start();origin=f'http://127.0.0.1:{server.server_port}'
   try:
    def get(path):
     with urlopen(origin+path,timeout=5)as response:return response.read()
    self.assertEqual(json.loads(get('/api/imports?roster=available')),[row])
    self.assertEqual(get('/api/announcer/'+slug),b'announcer.wav')
    self.assertEqual(get('/api/imports/portraits/'+slug+'.webp'),b'private portrait')
    self.assertEqual(get('/api/native-fit/assets/'+'b'*64+'/sources/person.json'),b'{"private":true}')
    with patch('opensmash_melee.native_source.prepare',return_value={'base':'prepared'})as prepare:
     with urlopen(Request(origin+'/api/native-fit/source/'+slug,method='POST',headers={'Origin':origin}),timeout=5)as response:self.assertEqual(json.loads(response.read()),{'base':'prepared'})
     self.assertEqual(prepare.call_args.args,(ROOT,source,slug));self.assertEqual(prepare.call_args.kwargs['cache_root'],cache)
    from opensmash_melee.targets import BY_SLUG
    target=BY_SLUG['mario'];costume=dict(character=slug,target='mario',fighter=target['fighter'],color=0,filename=target['costumes'][0]['filename'])
    def menu(game,entries,*,cache):
     self.assertEqual(entries[0][2],source);self.assertEqual(cache,manager.announcer_root)
     return {'menu.dat':(entries[0][2]/'stock_raw.png').read_bytes()}
    with patch('opensmash_melee.character_select.character_select_assets',side_effect=menu):
     body=json.dumps({'costumes':[costume],'sourceOnly':True}).encode()
     with urlopen(Request(origin+'/api/character-select',data=body,headers={'Origin':origin,'Content-Type':'application/json'}),timeout=5)as response:assets=json.loads(response.read())['assets']
    self.assertEqual(get(assets[0]['url']),b'stock_raw.png');self.assertTrue(manager.selection_root.is_relative_to(manager.root))
    self.assertTrue(any(manager.selection_root.rglob('*.bin')))
    with self.assertRaises(HTTPError)as error:urlopen(Request(origin+'/api/prepare/'+slug,method='POST',headers={'Origin':origin}),timeout=5)
    self.assertEqual(error.exception.code,409)
    self.assertFalse((root/'code/assets').exists());self.assertFalse((root/'code/build').exists())
   finally:server.shutdown();thread.join();server.server_close();manager.pool.shutdown()
if __name__=='__main__':unittest.main()
