import { useEffect, useState } from 'react';
// @ts-ignore
import { supabase } from './supabaseClient'; 

function App() {
  // 1. Fixed "implicit any" by defining the type as 'any'
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // 2. Fixed async handling of getSession
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user || null);
    });

    // 3. Fixed "implicit any" for event and session parameters
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="app-container">
      {/* If user is null, show your Login, otherwise show your Feed */}
      {!user ? (
        <div>{/* YOUR LOGIN COMPONENT GOES HERE */}</div>
      ) : (
        <div>{/* YOUR FEED COMPONENT GOES HERE */}</div>
      )}
    </div>
  );
}

export default App;