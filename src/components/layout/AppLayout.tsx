import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
    return (
        <div className="flex h-screen overflow-hidden bg-dark-950">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-6 max-w-7xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
