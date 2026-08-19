/*
  src/photo.js — Image capture layer (SOURCE — bundled by esbuild into
  www/js/photo.js). Same fix as db.js: real import instead of an assumed
  global, so the Camera plugin actually resolves at runtime.
*/
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

window.Ledger = window.Ledger || {};

Ledger.Photo = (function () {
  function isNative() {
    return Capacitor.isNativePlatform();
  }

  async function pick() {
    if (isNative()) {
      try {
        // getPhoto() triggers Android's runtime camera/gallery permission
        // prompt itself the first time it's called — no manual permission
        // code needed here. See AndroidManifest patch in the build
        // workflow for the declared permissions that make this prompt
        // available at all.
        const photo = await Camera.getPhoto({
          quality: 70,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt
        });
        return photo.dataUrl;
      } catch (e) {
        // User cancelled, or denied permission — not worth surfacing as an error.
        return null;
      }
    }

    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  return { pick };
})();
