export function isOlderVersion(current, minimum) {
    const a = current.split('.').map(Number);
    const b = minimum.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }

    return false;
}
