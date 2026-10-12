import hashlib,json,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from opensmash_melee.character_import import FILES,ImportManager,import_local_source

class PrivateRosterTests(unittest.TestCase):
 def fixture(self,root):
  export=root/'exports/alex';export.mkdir(parents=True)
  for name in FILES:
   if name.endswith('.png'):Image.new('RGB',(128,128),'red').save(export/name)
   else:(export/name).write_bytes(b'fixture')
  Image.new('RGB',(90,86),'blue').save(export/'portrait_tile.png')
  entry={'slug':'alex','name':'Alex','short':'ALEX','status':'validated_local_source','target':'mario','source_directory':str(export),'source_sha256':hashlib.sha256(b'fixture').hexdigest()}
  manifest=root/'roster-manifest.json';manifest.write_text(json.dumps({'version':1,'private':True,'characters':[entry]}))
  return manifest,entry,export
 def test_export_allowlist_ignores_intake_and_validates_model(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();manifest,entry,export=self.fixture(root);dest=root/'result';dest.mkdir()
   (export/'intake-photo.jpg').write_bytes(b'private original')
   with patch('opensmash_melee.character_import.GLB') as glb:
    glb.return_value.mesh.return_value={'positions':[],'triangles':[],'names':[]}
    info=import_local_source(entry,manifest,dest)
   self.assertEqual(info['name'],'Alex');self.assertFalse((dest/'intake-photo.jpg').exists())
   entry['source_sha256']='0'*64
   with self.assertRaisesRegex(ValueError,'integrity'):import_local_source(entry,manifest,dest)
 def test_rejects_external_directory_and_symlink_assets(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();manifest,entry,export=self.fixture(root);dest=root/'result';dest.mkdir()
   entry['source_directory']=str(root)
   with self.assertRaisesRegex(ValueError,'export directories'):import_local_source(entry,manifest,dest)
   entry['source_directory']=str(export);(export/'rigged.glb').unlink();(export/'rigged.glb').symlink_to(root/'secret')
   with self.assertRaisesRegex(ValueError,'source asset'):import_local_source(entry,manifest,dest)
 def test_only_ready_entries_and_no_conversion(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();manifest,entry,export=self.fixture(root)
   data=json.loads(manifest.read_text());data['characters'].append({'status':'pending','source_directory':'/unreadable/intake'});manifest.write_text(json.dumps(data))
   manager=ImportManager({},threading.Lock(),workspace=root/'workspace')
   def retain(source,dest):
    import shutil
    shutil.copytree(source,dest)
   try:
    with patch('opensmash_melee.character_import.GLB') as glb,patch('opensmash_melee.__main__.import_character',side_effect=retain),patch('opensmash_melee.character_import.run_stage') as convert:
     glb.return_value.mesh.return_value={'positions':[],'triangles':[],'names':[]}
     rows=manager.load_local_roster(manifest)
     self.assertEqual(len(rows),1);self.assertIn('portraitTile',rows[0]);convert.assert_not_called()
     with Image.open(manager.root/(rows[0]['slug']+'-tile.webp')) as art:self.assertEqual(art.size,(90,86))
     self.assertEqual(manager.load_local_roster(manifest),rows)
     (export/'announcer.wav').write_bytes(b'updated local voice')
     data['characters'][0]['status']='actual_native_game_smoke_passed';manifest.write_text(json.dumps(data))
     current=manager.load_local_roster(manifest)
     self.assertEqual(len(current),1);self.assertNotEqual(current[0]['slug'],rows[0]['slug'])
     self.assertEqual(manager.private_rows,current);self.assertEqual(len(manager.rows),2)
     self.assertIn(rows[0]['slug'],manager.catalog)
     slug=current[0]['slug'];manager.remove(slug)
     self.assertEqual(manager.private_rows,[])
     self.assertFalse((manager.root/(slug+'-tile.webp')).exists())
   finally:manager.pool.shutdown()

if __name__=='__main__':unittest.main()

class HostedPortraitCompatibilityTests(unittest.TestCase):
 def test_ordinary_import_portrait_keeps_the_existing_hosted_url_contract(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();source=root/'source';source.mkdir();Image.new('RGB',(180,172),'red').save(source/'portrait_raw.png')
   manager=ImportManager({},threading.Lock(),workspace=root/'workspace')
   try:
    slug='import-'+'a'*24;row=manager.portraits(source,slug)
    self.assertEqual(row,{'portrait':f'/api/imports/portraits/{slug}.webp'})
    self.assertEqual(list(manager.root.glob('*.webp')),[manager.root/(slug+'.webp')])
   finally:manager.pool.shutdown()
