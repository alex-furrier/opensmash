import json,tempfile,threading,unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import urlopen,Request
from urllib.error import HTTPError
from unittest.mock import patch
from types import SimpleNamespace
from tools import serve_melee as server
from opensmash_melee.targets import costume_target_allowed

class RosterChoiceRoutes(unittest.TestCase):
 def test_required_companion_costumes_remain_available_without_becoming_selectable_bases(self):
  for primary,companion in [('popo','nana'),('sheik','zelda'),('zelda','sheik')]:
   row={'target':primary,'supportedTargets':[primary]}
   self.assertTrue(costume_target_allowed(row,primary));self.assertTrue(costume_target_allowed(row,companion));self.assertNotIn(companion,row['supportedTargets']);self.assertFalse(costume_target_allowed(row,'fox'))
  self.assertTrue(costume_target_allowed({'target':'mario'},'fox'))
 def test_available_roster_requires_complete_source_and_untested_pairs_never_prepare(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);source=root/'library'/'present';source.mkdir(parents=True)
   for name in ['rigged.glb','portrait_raw.png','stock_raw.png','emblem_raw.png','announcer.wav']:(source/name).write_bytes(b'fixture')
   rows={slug:{'slug':slug,'name':slug,'target':'mario','defaultTarget':'mario','supportedTargets':['mario']} for slug in ['present','absent']}
   with patch.multiple(server,ROOT=root,CHARACTERS=root/'library',TOKEN='',CATALOG=rows,SETUP=SimpleNamespace(ready=True)),patch.object(server,'run_stage') as convert:
    http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start();origin=f'http://127.0.0.1:{http.server_port}'
    try:
     available=json.load(urlopen(origin+'/api/imports?roster=available'));self.assertEqual([row['slug'] for row in available],['present'])
     for path,method in [('/api/prepare/present?target=fox','POST'),('/api/costume/present?target=fox','GET')]:
      with self.assertRaises(HTTPError) as failure:urlopen(Request(origin+path,method=method))
      self.assertIn(failure.exception.code,[400,404])
     convert.assert_not_called()
     (source/'rigged.glb').unlink();self.assertEqual(json.load(urlopen(origin+'/api/imports?roster=available')),[])
    finally:http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
