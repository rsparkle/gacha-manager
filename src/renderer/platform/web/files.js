export function downloadTextFile(fileName, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName });

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(accept) {
    return new Promise((resolve, reject) => {
        const input = Object.assign(document.createElement('input'), { type: 'file', accept });

        input.addEventListener(
            'change',
            () => {
                const file = input.files?.[0];

                if (file) file.text().then(resolve, reject);
                else resolve(null);
            },
            { once: true },
        );

        input.addEventListener('cancel', () => resolve(null), { once: true });

        input.click();
    });
}
