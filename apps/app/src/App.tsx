import { useEffect, useState } from 'react';
import { BookingForm } from './components/BookingForm';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Menu } from './components/Menu';
import { StaffPage } from './components/StaffPage';
import { TodaysSpecial } from './components/TodaysSpecial';

const pageFromHash = () => (window.location.hash.startsWith('#/staff') ? 'staff' : 'home');

export default function App() {
  const [page, setPage] = useState<'home' | 'staff'>(pageFromHash);

  useEffect(() => {
    const onHashChange = () => {
      const next = pageFromHash();
      setPage((current) => {
        if (current !== next) window.scrollTo(0, 0);
        return next;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div id="top">
      <Header page={page} />
      <main>
        {page === 'staff' ? (
          <StaffPage />
        ) : (
          <>
            <Hero />
            <Menu />
            <TodaysSpecial />
            <BookingForm />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
