import tempfile,unittest,wave
from pathlib import Path
from opensmash_melee.character_select import dsp_clip
class UnvoicedCharacterTests(unittest.TestCase):
 def test_empty_pcm_is_a_deterministic_silent_block_without_changing_source(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'announcer.wav'
   with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(32000);w.writeframes(b'')
   before=path.read_bytes();first=dsp_clip(path,Path(temp)/'cache',trim=True)
   self.assertEqual(first[0],b'\0'*8);self.assertEqual(first[1:3],(32000,14));self.assertEqual(first,dsp_clip(path,Path(temp)/'cache',trim=True));self.assertEqual(path.read_bytes(),before)
 def test_invalid_pcm_format_is_still_rejected(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'announcer.wav'
   with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(1);w.setframerate(32000);w.writeframes(b'')
   with self.assertRaisesRegex(ValueError,'16-bit'):dsp_clip(path)
