import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { generateGameCode } from './lib/gemini';
import { GameViewer } from './components/GameViewer';
import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, updateDoc, Timestamp, addDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Gamepad2, CreditCard, LogOut, Zap, Clock, History, Play, Code, Box, Layers } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock');

const KriloApp = () => {
  const { user, userData, login, logout, loading } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [gameType, setGameType] = useState<'2D' | '3D'>('2D');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Handle Stripe Success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (sessionId && user && userData) {
      const verifySession = async () => {
        try {
          const response = await fetch(`/api/verify-session?session_id=${sessionId}`);
          const data = await response.json();

          if (data.payment_status === 'paid' && data.client_reference_id === user.uid) {
            // Check if this session was already processed (simple check using local storage for demo)
            const processedSessions = JSON.parse(localStorage.getItem('processed_sessions') || '[]');
            if (!processedSessions.includes(sessionId)) {
              const creditsToAdd = data.credits_to_add || 1000;
              const userRef = doc(db, 'users', user.uid);
              await updateDoc(userRef, {
                credits: (userData.credits || 0) + creditsToAdd,
                subscriptionType: 'pro'
              });
              
              processedSessions.push(sessionId);
              localStorage.setItem('processed_sessions', JSON.stringify(processedSessions));
              setSuccessMessage(`Success! ${creditsToAdd} credits added to your account.`);
              
              // Clear URL params
              window.history.replaceState({}, document.title, "/");
            }
          }
        } catch (err) {
          console.error('Session verification failed:', err);
        }
      };
      verifySession();
    }
  }, [user, userData]);

  // Credit Refill Logic
  useEffect(() => {
    if (userData && userData.credits === 0) {
      const lastRefill = userData.lastRefill.toDate();
      const now = new Date();
      const diff = (now.getTime() - lastRefill.getTime()) / (1000 * 60);
      
      if (diff >= 5) {
        const userRef = doc(db, 'users', userData.uid);
        updateDoc(userRef, {
          credits: 50,
          lastRefill: Timestamp.now()
        }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'users'));
      }
    }
  }, [userData]);

  // Fetch History
  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'games'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(q, (snapshot) => {
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (e) => handleFirestoreError(e, OperationType.LIST, 'games'));
      return () => unsub();
    }
  }, [user]);

  const handleGenerate = async () => {
    if (!userData || userData.credits < 5) {
      setError('Insufficient credits. Wait 5 minutes or upgrade.');
      return;
    }

    setIsGenerating(true);
    setError('');
    try {
      const code = await generateGameCode(prompt, gameType);
      setGeneratedCode(code);

      // Deduct credits and save game
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        credits: userData.credits - 5
      });

      await addDoc(collection(db, 'games'), {
        userId: user.uid,
        title: prompt.slice(0, 30) + '...',
        prompt,
        code,
        type: gameType,
        createdAt: Timestamp.now()
      });

    } catch (err: any) {
      setError('Generation failed: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubscribe = async (type: 'pro' | 'plus' | 'ultra') => {
    // Special handling for Pro plan with the provided URL
    if (type === 'pro') {
      const proUrl = `https://buy.stripe.com/test_7sYdR27LO7xT9iVel0bII00?client_reference_id=${user?.uid}`;
      window.open(proUrl, '_blank');
      return;
    }

    const prices = {
      pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
      plus: import.meta.env.VITE_STRIPE_PLUS_PRICE_ID,
      ultra: import.meta.env.VITE_STRIPE_ULTRA_PRICE_ID
    };

    if (!prices[type] || !prices[type].startsWith('price_')) {
      setError(`Invalid Stripe Price ID for ${type}. Please use the 'Price ID' (starts with 'price_') from your Stripe Dashboard, not the numerical price.`);
      return;
    }

    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: prices[type],
          userId: user?.uid,
          email: user?.email
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (err: any) {
      setError('Payment error: ' + err.message);
      console.error(err);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white font-mono">LOADING KRILO...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-6xl font-black tracking-tighter text-white uppercase italic">Krilo AI</h1>
            <p className="text-white/40 font-mono text-sm tracking-widest uppercase">The Next Generation of Game Dev</p>
          </div>
          
          <div className="p-8 bg-white/5 border border-white/10 rounded-2xl space-y-6">
            <p className="text-white/60 text-sm leading-relaxed">
              Generate fully functional 2D and 3D games using advanced AI. 
              Start with 50 free credits.
            </p>
            <button 
              onClick={login}
              className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-white/90 transition-colors rounded-xl flex items-center justify-center gap-2"
            >
              <Sparkles size={18} />
              Login with Google
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-white selection:text-black">
      {/* Header */}
      <header className="border-bottom border-white/10 p-6 flex justify-between items-center sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">Krilo</h2>
          <div className="h-4 w-[1px] bg-white/20" />
          <div className="flex items-center gap-2 text-xs font-mono text-white/40 uppercase tracking-widest">
            <Zap size={14} className="text-orange-500" />
            <span>{userData?.credits} Credits</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-xs font-mono uppercase tracking-widest text-white/40">
            <span>{userData?.subscriptionType} Plan</span>
            <button onClick={() => {}} className="text-white hover:text-orange-500 transition-colors">Upgrade</button>
          </div>
          <button onClick={logout} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Generation Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setGameType('2D')}
                className={`py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${gameType === '2D' ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:border-white/30'}`}
              >
                <Layers size={18} />
                <span className="font-bold uppercase text-xs tracking-widest">2D Engine</span>
              </button>
              <button 
                onClick={() => setGameType('3D')}
                className={`py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${gameType === '3D' ? 'bg-white text-black border-white' : 'border-white/10 text-white/60 hover:border-white/30'}`}
              >
                <Box size={18} />
                <span className="font-bold uppercase text-xs tracking-widest">3D Engine</span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Game Concept</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your game mechanics, visuals, and goals..."
              className="w-full h-48 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-white/30 transition-colors resize-none placeholder:text-white/20"
            />
            {error && <p className="text-red-500 text-xs font-mono uppercase">{error}</p>}
            {successMessage && <p className="text-green-500 text-xs font-mono uppercase">{successMessage}</p>}
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !prompt}
              className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-600/20"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Zap size={18} />
                  <span>Forge Game (5 Credits)</span>
                </>
              )}
            </button>
          </section>

          {/* Subscriptions */}
          <section className="space-y-4 pt-8 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Premium Access</label>
              {(!import.meta.env.VITE_STRIPE_PRO_PRICE_ID || !import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) && (
                <span className="text-[8px] font-mono text-red-500 animate-pulse uppercase">Config Required</span>
              )}
            </div>
            <div className="space-y-2">
              {[
                { id: 'pro', name: 'Pro', duration: '1 Week', price: '$9.99' },
                { id: 'plus', name: 'Plus', duration: '2 Weeks', price: '$17.99' },
                { id: 'ultra', name: 'Ultra', duration: '3 Weeks', price: '$24.99' }
              ].map((sub) => (
                <button 
                  key={sub.id}
                  onClick={() => handleSubscribe(sub.id as any)}
                  className="w-full p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors group"
                >
                  <div className="text-left">
                    <p className="font-bold uppercase text-xs tracking-widest">{sub.name}</p>
                    <p className="text-[10px] text-white/40 font-mono">{sub.duration}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-orange-500">{sub.price}</span>
                    <CreditCard size={14} className="text-white/20 group-hover:text-white transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Preview & History */}
        <div className="lg:col-span-8 space-y-8">
          <AnimatePresence mode="wait">
            {generatedCode ? (
              <motion.div 
                key="viewer"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
                    <Play size={14} /> Live Preview
                  </h3>
                  <button 
                    onClick={() => setGeneratedCode('')}
                    className="text-[10px] font-mono uppercase text-white/40 hover:text-white"
                  >
                    Close Preview
                  </button>
                </div>
                <GameViewer code={generatedCode} />
              </motion.div>
            ) : (
              <motion.div 
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[600px] bg-white/5 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-8"
              >
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <Gamepad2 size={32} className="text-white/20" />
                </div>
                <h3 className="text-xl font-bold uppercase tracking-widest mb-2 text-white/60">No Game Active</h3>
                <p className="text-white/30 text-sm max-w-xs font-mono">
                  Enter a prompt and click "Forge Game" to see the magic happen.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History */}
          <section className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 flex items-center gap-2">
              <History size={14} /> Generation History
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((game) => (
                <button 
                  key={game.id}
                  onClick={() => setGeneratedCode(game.code)}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl text-left hover:border-white/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${game.type === '3D' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                      {game.type}
                    </span>
                    <span className="text-[10px] font-mono text-white/20">
                      {game.createdAt?.toDate().toLocaleDateString()}
                    </span>
                  </div>
                  <p className="font-bold text-sm truncate mb-1 group-hover:text-orange-500 transition-colors uppercase tracking-tight">{game.title}</p>
                  <p className="text-[10px] text-white/30 truncate font-mono italic">"{game.prompt}"</p>
                </button>
              ))}
              {history.length === 0 && (
                <div className="col-span-full py-12 text-center text-white/20 font-mono text-xs uppercase tracking-widest border border-dashed border-white/10 rounded-xl">
                  Your forge is cold. Start generating.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Atmospheric Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <KriloApp />
    </AuthProvider>
  );
}
