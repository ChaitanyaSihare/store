/*
  photo.js — Image capture layer
  Native: @capacitor/camera opens the real camera/gallery picker.
  Browser fallback: a hidden file input, so this still works when testing
  in a desktop/mobile browser before the APK is built.
*/
window.Ledger = window.Ledger || {};

Ledger.Photo = (function () {
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  async function pick() {
    if (isNative() && window.Capacitor.Plugins.Camera) {
      try {
        const { Camera, CameraResultType, CameraSource } = window.Capacitor.Plugins;
        const photo = await Camera.getPhoto({
          quality: 70,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt // lets the user choose camera or gallery
        });
        return photo.dataUrl;
      } catch (e) {
        // User cancelled — not an error worth surfacing.
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
