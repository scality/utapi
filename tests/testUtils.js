export function getNormalizedTimestamp() {
    const d = new Date();
    const minutes = d.getMinutes();
    return d.setMinutes((minutes - minutes % 15), 0, 0);
}
