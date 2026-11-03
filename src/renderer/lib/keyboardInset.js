let users = 0;

const revealFocusedField = () => {
    const field = document.activeElement;

    if (field?.closest?.('dialog[open]')) field.scrollIntoView({ block: 'nearest' });
};

const update = () => {
    const viewport = window.visualViewport;
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);

    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    requestAnimationFrame(revealFocusedField);
};

export const trackKeyboardInset = () => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;

    if (!viewport) return () => {};

    if (users++ === 0) {
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);
        update();
    }

    let stopped = false;

    return () => {
        if (stopped) return;
        stopped = true;

        if (--users > 0) return;

        viewport.removeEventListener('resize', update);
        viewport.removeEventListener('scroll', update);
        document.documentElement.style.removeProperty('--keyboard-inset');
    };
};
