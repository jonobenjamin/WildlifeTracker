/**
 * Add a Leaflet control under the default zoom (+/−) that resets the map view.
 * @param {object} L Leaflet namespace
 * @param {object} map Leaflet map
 * @param {() => void} onReset callback to fit home bounds
 */
export function addHomeZoomControl(L, map, onReset) {
  if (!L || !map || typeof onReset !== 'function') return null;

  const HomeControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control kpr-home-control');
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = 'Reset map view';
      link.setAttribute('role', 'button');
      link.setAttribute('aria-label', 'Reset map view');
      link.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M12 3.2 3.5 10.4V21h6.2v-6.3h4.6V21h6.2V10.4L12 3.2z"/>' +
        '</svg>';
      link.style.display = 'flex';
      link.style.alignItems = 'center';
      link.style.justifyContent = 'center';
      link.style.width = '30px';
      link.style.height = '30px';
      link.style.lineHeight = '30px';
      link.style.color = '#333';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        onReset();
      });
      return container;
    },
  });

  const control = new HomeControl();
  map.addControl(control);
  return control;
}
