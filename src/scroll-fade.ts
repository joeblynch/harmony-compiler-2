(() => {
  const playlistEl = document.getElementById('playlist')!;
  const FADE_HEIGHT_EM = 4;

  function updatePlaylistMask() {
    const scrollTop = playlistEl.scrollTop;
    const scrollHeight = playlistEl.scrollHeight;
    const clientHeight = playlistEl.clientHeight;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    // Convert 4em to pixels
    const fontSize = parseFloat(getComputedStyle(playlistEl).fontSize);
    const fadeHeightPx = FADE_HEIGHT_EM * fontSize;

    // Calculate fade for top: 1 at top, transitions to 0 when 4em scrolled
    let topFade = 1;
    if (scrollTop > 0) {
      topFade = Math.max(1 - (scrollTop / fadeHeightPx), 0);
    }

    // Calculate fade for bottom: 1 at bottom, transitions to 0 when 4em from bottom
    let bottomFade = 1;
    if (scrollBottom > 0) {
      bottomFade = Math.max(1 - (scrollBottom / fadeHeightPx), 0);
    }

    playlistEl.style.setProperty('--top-fade', topFade.toString());
    playlistEl.style.setProperty('--bottom-fade', bottomFade.toString());
  }

  playlistEl.addEventListener('scroll', updatePlaylistMask);

  updatePlaylistMask();
})();