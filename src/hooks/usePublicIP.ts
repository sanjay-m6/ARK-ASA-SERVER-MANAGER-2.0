import { useQuery } from '@tanstack/react-query';

interface IpifyResponse {
    ip: string;
}

export function usePublicIP() {
    return useQuery({
        queryKey: ['publicIP'],
        queryFn: async (): Promise<string> => {
            const response = await fetch('https://api.ipify.org/?format=json');
            if (!response.ok) {
                throw new Error('Failed to detect public IP');
            }
            const data: IpifyResponse = await response.json();
            return data.ip;
        },
        staleTime: 60 * 1000 * 30, // 30 minutes
        retry: 2,
    });
}
