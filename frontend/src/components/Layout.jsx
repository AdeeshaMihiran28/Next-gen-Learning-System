import Header from './Header';
import Footer from './Footer';
import { useLocation } from 'react-router-dom';

function Layout({ children }) {
    const location = useLocation();
    const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 transition-colors duration-300">
            {!isAuthPage && <Header />}
            <main className="flex-1">
                {children}
            </main>
            {!isAuthPage && <Footer />}
        </div>
    );
}

export default Layout;
