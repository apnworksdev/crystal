import { enableVisualEditing } from '@sanity/visual-editing/enable-visual-editing';

const currentUrl = () => location.pathname + location.search + location.hash;

enableVisualEditing({
  // Pages are rendered on the server, so a reload shows the latest draft.
  refresh: () => {
    location.reload();
    return new Promise(() => {});
  },
  history: {
    subscribe(navigate) {
      navigate({ type: 'replace', url: currentUrl() });
      return () => {};
    },
    update({ type, url }) {
      if (type === 'pop') history.back();
      else if (url && url !== currentUrl()) location.assign(url);
    },
  },
});
