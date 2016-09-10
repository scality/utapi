/**
* Takes a timestamp and normalizes it to the day by removing hours, minutes,
* seconds and milliseconds
* @param {number} timestamp - unix timestamp
* @return {number} timespan - timestamp normalized to the day
*/
export default function getTimespan(timestamp) {
    return new Date(timestamp).setHours(0, 0, 0, 0);
}
