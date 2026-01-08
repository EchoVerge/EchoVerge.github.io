export function formatDate(d) { 
    return d.toISOString().split('T')[0]; 
}

export function getWeekNumber(d) {
    let date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    let week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function getWeekKey(d) {
    let target = new Date(d);
    target.setDate(target.getDate() - target.getDay());
    return formatDate(target);
}