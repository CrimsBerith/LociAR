import unittest

import extract


class StorageLiteralExtractionTests(unittest.TestCase):
    def test_stored_identifiers_do_not_become_public_translation_keys(self):
        self.assertFalse(extract.wanted(
            '12345678-ABCD-4321-ABCD-123456789ABC',
            'UserDefaults.standard.set(',
        ))
        self.assertFalse(extract.wanted('internal storage value', 'UserDefaults.standard.set('))

    def test_debug_camera_metrics_do_not_become_product_copy(self):
        self.assertFalse(extract.wanted('camera view=none', 'cachedCameraRenderDiagnostic = '))
        self.assertTrue(extract.wanted('Kamera görüntüsü alınamadı', 'Text('))

    def test_visible_turkish_disclosures_are_still_extracted(self):
        self.assertTrue(extract.wanted('Google AR ve Sensör Verisi', 'Text('))
        self.assertTrue(extract.wanted('Oturumun doğrulanamadı. Tekrar dene.', 'String(localized: '))


if __name__ == '__main__':
    unittest.main()
