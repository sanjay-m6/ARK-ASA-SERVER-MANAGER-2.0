import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

export function generateAutoServerName(existingServers: { name?: string; installPath?: string }[]): string {
    let i = 1;
    while (true) {
        const candidate = `server${i}`;
        const candidateAlt = `server_${i}`;
        const candidateSpace = `server ${i}`;
        const exists = existingServers.some(s => {
            const nameLower = (s.name || '').toLowerCase();
            const pathLower = (s.installPath || '').toLowerCase();
            return nameLower === candidate ||
                   nameLower === candidateAlt ||
                   nameLower === candidateSpace ||
                   pathLower.endsWith(`\\${candidate}`) ||
                   pathLower.endsWith(`/${candidate}`) ||
                   pathLower.endsWith(`\\${candidateAlt}`) ||
                   pathLower.endsWith(`/${candidateAlt}`);
        });
        if (!exists) {
            return candidate;
        }
        i++;
    }
}
