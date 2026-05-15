
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PrizeId, DrawingState } from './types';
import { PRIZES, DRAW_DURATION_SECONDS, ROLL_INTERVAL_MS } from './constants';

const App: React.FC = () => {
  const defaultPrizeId = PRIZES[PRIZES.length - 1].id;
  const [selectedPrize, setSelectedPrize] = useState<PrizeId>(defaultPrizeId);
  const [drawDuration, setDrawDuration] = useState<number>(DRAW_DURATION_SECONDS);
  const [hudColor, setHudColor] = useState<string>('#7dcfff'); // Default Tokyo Cyan
  const [digitCount, setDigitCount] = useState<number>(2); // 2: 00-99, 3: 000-999, etc.
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  
  const DIGIT_OPTIONS = [2, 3, 4, 5];
  
  const HUD_THEMES = [
    { name: 'Cyan', color: '#7dcfff' },
    { name: 'Purple', color: '#bb9af7' },
    { name: 'Green', color: '#9ece6a' },
    { name: 'Red', color: '#f7768e' },
    { name: 'Orange', color: '#ff9e64' },
    { name: 'Yellow', color: '#e0af68' },
  ];
  
  const [results, setResults] = useState<Record<PrizeId, string[]>>(() => {
    const initial: any = {};
    PRIZES.forEach(p => initial[p.id] = []);
    return initial;
  });
  
  const [drawState, setDrawState] = useState<DrawingState & { finalWinner: string | null; currentProgress: number }>({
    isDrawing: false,
    rollingNumber: '00',
    targetPrize: null,
    secondsRemaining: 0,
    totalDuration: 0,
    finalWinner: null,
    currentProgress: 100
  });

  const [celebration, setCelebration] = useState<{ prizeLabel: string, number: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lastSessionWinner, setLastSessionWinner] = useState<{ prizeId: PrizeId, number: string } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playClickSound = useCallback(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, []);

  const playWinSound = useCallback(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playNote(523.25, now, 0.4); 
    playNote(659.25, now + 0.1, 0.4); 
    playNote(783.99, now + 0.2, 0.6); 
    playNote(1046.50, now + 0.35, 0.8);
  }, []);

  const usedNumbers = useMemo(() => {
    return new Set(Object.values(results).flat());
  }, [results]);
  
  const maxRange = useMemo(() => Math.pow(10, digitCount), [digitCount]);
  const remainingCount = maxRange - usedNumbers.size;

  const timerRef = useRef<any>(null);
  const rollingRef = useRef<any>(null);
  const drawingContextRef = useRef<{ prizeId: PrizeId, winner: string } | null>(null);

  const startDraw = useCallback((duration: number) => {
    if (drawState.isDrawing) return;
    initAudio();
    setCelebration(null);
    setLastSessionWinner(null);

    const availableNumbers: string[] = [];
    for (let i = 0; i < maxRange; i++) {
      const num = i.toString().padStart(digitCount, '0');
      if (!usedNumbers.has(num)) {
        availableNumbers.push(num);
      }
    }

    if (availableNumbers.length === 0) {
      alert("Đã hết số để quay! Vui lòng Reset giải để bắt đầu lại.");
      return;
    }

    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const chosenWinner = availableNumbers[randomIndex];

    drawingContextRef.current = { prizeId: selectedPrize, winner: chosenWinner };

    setDrawState(prev => ({
      ...prev,
      isDrawing: true,
      rollingNumber: '0'.repeat(digitCount),
      targetPrize: selectedPrize,
      secondsRemaining: duration,
      totalDuration: duration,
      finalWinner: chosenWinner,
      currentProgress: 100
    }));

    rollingRef.current = setInterval(() => {
      const randomNum = Math.floor(Math.random() * maxRange);
      const padded = randomNum.toString().padStart(digitCount, '0');
      setDrawState(prev => ({ ...prev, rollingNumber: padded }));
      playClickSound();
    }, ROLL_INTERVAL_MS);

    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    const tick = () => {
      const now = Date.now();
      const remainingMs = Math.max(0, endTime - now);
      const remainingSecs = Math.ceil(remainingMs / 1000);
      const progress = (remainingMs / (duration * 1000)) * 100;
      
      setDrawState(prev => ({ 
        ...prev, 
        secondsRemaining: remainingSecs,
        currentProgress: progress
      }));

      if (now >= endTime) {
        finishDraw();
      } else {
        timerRef.current = setTimeout(tick, 30);
      }
    };

    timerRef.current = setTimeout(tick, 30);
  }, [selectedPrize, drawState.isDrawing, usedNumbers, playClickSound]);

  const finishDraw = useCallback(() => {
    if (rollingRef.current) clearInterval(rollingRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    const context = drawingContextRef.current;
    if (!context) return;
    drawingContextRef.current = null; // Prevent double execution

    playWinSound();

    const { prizeId, winner } = context;
    const prizeLabel = PRIZES.find(p => p.id === prizeId)?.label || "Giải thưởng";

    setResults(oldResults => ({
      ...oldResults,
      [prizeId]: [...oldResults[prizeId], winner]
    }));
    setLastSessionWinner({ prizeId, number: winner });
    setCelebration({ prizeLabel, number: winner });

    setDrawState(prev => ({
      ...prev,
      isDrawing: false,
      rollingNumber: winner,
      secondsRemaining: 0,
      totalDuration: 0,
      finalWinner: null,
      currentProgress: 0
    }));
  }, [playWinSound]);

  const handleActualReset = () => {
    initAudio();
    const clearedResults: any = {};
    PRIZES.forEach(p => clearedResults[p.id] = []);
    setResults(clearedResults);
    setSelectedPrize(defaultPrizeId);
    setCelebration(null);
    setLastSessionWinner(null);
    setShowResetConfirm(false);
    setDrawState({
      isDrawing: false,
      rollingNumber: '0'.repeat(digitCount),
      targetPrize: null,
      secondsRemaining: 0,
      totalDuration: 0,
      finalWinner: null,
      currentProgress: 100
    });
  };

  const handleDigitCountChange = (count: number) => {
    if (usedNumbers.size > 0) {
      if (confirm(`Thay đổi số chữ số sẽ xóa tất cả kết quả hiện tại (${usedNumbers.size} số). Bạn có chắc muốn tiếp tục?`)) {
        setDigitCount(count);
        handleActualReset();
      }
    } else {
      setDigitCount(count);
      setDrawState(prev => ({ ...prev, rollingNumber: '0'.repeat(count) }));
    }
  };

  const handleDrawAgain = () => {
    setCelebration(null);
    setTimeout(() => {
      startDraw(drawDuration);
    }, 300);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showResetConfirm) {
        setShowResetConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm]);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 3000);
    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--hud-accent', hudColor);
  }, [hudColor]);

  useEffect(() => {
    return () => {
      if (rollingRef.current) clearInterval(rollingRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (drawState.currentProgress / 100) * circumference;
  
  // HUD Circle settings
  const hudRadius = 50;
  const hudCircumference = 2 * Math.PI * hudRadius;
  const hudDashOffset = hudCircumference - (drawState.currentProgress / 100) * hudCircumference;

  const isWarning = drawState.secondsRemaining <= 5 && drawState.secondsRemaining > 2 && drawState.isDrawing;
  const isUrgent = drawState.secondsRemaining <= 2 && drawState.secondsRemaining > 0 && drawState.isDrawing;
  const isDanger = drawState.secondsRemaining === 0 && drawState.isDrawing;

  // Dynamic colors: Green/Theme -> Orange -> Red
  const timerColor = isUrgent ? '#f7768e' : isWarning ? '#ff9e64' : (hudColor === '#7dcfff' ? '#9ece6a' : hudColor);
  const timerLabel = isUrgent ? 'CRITICAL' : isWarning ? 'WARNING' : 'STABLE';

  const activePrizeLabel = PRIZES.find(p => p.id === drawState.targetPrize)?.label;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0d0f18] text-[#c0caf5] relative font-mono overflow-x-hidden" role="main">
      
      {/* SPLASH SCREEN */}
      {isSplashVisible && (
        <div className="fixed inset-0 z-[1000] bg-[#0d0f18] flex flex-col items-center justify-center animate-out fade-out duration-1000 fill-mode-forwards" style={{ animationDelay: '2s' }}>
          <div className="relative mb-8 animate-in zoom-in-50 duration-700">
            {/* Pulsing Outer Ring */}
            <div className="absolute inset-[-40px] rounded-full opacity-20 blur-3xl animate-pulse bg-[#7dcfff]"></div>
            
            {/* Modern Deca-Logo (SVG) */}
            <div className="relative w-32 h-32 flex items-center justify-center bg-[#1a1b26] border-2 border-[#7dcfff] rounded-2xl rotate-45 group overflow-hidden shadow-[0_0_30px_rgba(125,207,255,0.2)]">
              <div className="absolute inset-0 bg-[#7dcfff]/5 animate-scan opacity-40"></div>
              <div className="-rotate-45 font-black text-6xl text-[#7dcfff] drop-shadow-[0_0_10px_rgba(125,207,255,0.5)]">
                Q
              </div>
              <div className="absolute top-1 left-1 w-2 h-2 bg-[#7dcfff] rounded-full"></div>
              <div className="absolute bottom-1 right-1 w-2 h-2 bg-[#7dcfff] rounded-full"></div>
            </div>
          </div>
          
          <div className="text-center animate-in slide-in-from-bottom-10 duration-1000">
            <h1 className="text-3xl font-black text-[#c0caf5] tracking-[0.2em] mb-2 uppercase">
              CHƯƠNG TRÌNH QUAY SỐ
            </h1>
            <div className="flex items-center justify-center gap-4">
              <span className="h-px w-8 bg-[#414868]"></span>
              <span className="text-[#7dcfff] text-xs font-black tracking-[0.5em] uppercase">May Mắn Mỗi Ngày</span>
              <span className="h-px w-8 bg-[#414868]"></span>
            </div>
          </div>

          <div className="absolute bottom-12 flex flex-col items-center gap-4 animate-pulse">
            <div className="w-48 h-1 bg-[#1a1b26] rounded-full overflow-hidden border border-[#414868]/30">
              <div className="h-full bg-[#7dcfff] animate-progress-load"></div>
            </div>
            <p className="text-[9px] text-[#565f89] font-black tracking-[0.4em] uppercase">Initializing Random Seed...</p>
          </div>
        </div>
      )}

      {/* SCREEN PULSE OVERLAY */}
      {isUrgent && (
        <div className="fixed inset-0 pointer-events-none z-[190] animate-warning-pulse opacity-20" style={{ boxShadow: `inset 0 0 100px ${timerColor}` }}></div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setShowResetConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div 
            className="bg-[#1a1b26] border border-[#414868] rounded-xl p-8 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-red-900/20 border border-red-500/30 rounded-full flex items-center justify-center mb-6" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 id="reset-modal-title" className="text-xl font-black text-[#c0caf5] mb-2 tracking-widest uppercase">XÁC NHẬN RESET?</h3>
              <p className="text-[#565f89] mb-8 leading-relaxed text-xs uppercase tracking-wider">
                Hành động này sẽ xóa sạch danh sách trúng thưởng.
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={handleActualReset}
                  className="w-full py-4 bg-red-600/80 text-white font-black rounded-lg hover:bg-red-700 transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 border border-red-500/50 text-xs tracking-widest"
                  aria-label="Xác nhận xóa tất cả kết quả"
                >
                  XÁC NHẬN
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-4 bg-[#24283b] text-[#c0caf5] font-bold rounded-lg hover:bg-[#2f334d] transition-colors border border-[#414868] text-xs tracking-widest"
                  aria-label="Hủy bỏ và quay lại"
                >
                  HỦY BỎ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Celebration Overlay */}
      {celebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-500" role="alert" aria-live="assertive">
          <div className="bg-[#1a1b26] border border-[#7dcfff]/30 rounded-xl p-10 max-md w-full shadow-[0_0_50px_rgba(125,207,255,0.1)] text-center relative overflow-hidden animate-in zoom-in-90 slide-in-from-bottom-10 duration-500">
            {[...Array(20)].map((_, i) => (
              <div 
                key={i} 
                className="absolute w-3 h-3 rounded-sm opacity-60 pointer-events-none"
                aria-hidden="true"
                style={{
                  backgroundColor: ['#f7768e', '#7dcfff', '#ff9e64', '#9ece6a', '#bb9af7'][i % 5],
                  top: '-20px',
                  left: `${Math.random() * 100}%`,
                  animation: `fall ${1.5 + Math.random() * 2}s linear infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              />
            ))}
            <div className="mb-6 flex justify-center" aria-hidden="true">
              <div className="w-20 h-20 bg-amber-900/20 border border-amber-500/30 rounded-full flex items-center justify-center animate-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-[#ff9e64]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
                </svg>
              </div>
            </div>
            <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[#f7768e] to-[#ff9e64] mb-2 uppercase tracking-tighter">
              THẮNG GIẢI!
            </h2>
            <p className="text-[#a9b1d6] font-bold mb-8 text-xl uppercase tracking-[0.2em]">{celebration.prizeLabel}</p>
            <div className="mb-10 relative inline-block group">
              <div className="absolute inset-0 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity animate-pulse" aria-hidden="true" style={{ backgroundColor: hudColor }}></div>
              <span className="relative block text-9xl font-black font-mono border-b-[8px] leading-none pb-4 tracking-tighter hypr-text-glow shadow-[0_0_20px_rgba(0,0,0,0.5)]" style={{ color: hudColor, borderBottomColor: `${hudColor}80` }}>
                {celebration.number}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={() => setCelebration(null)}
                className="flex-1 py-4 bg-[#24283b] text-[#c0caf5] rounded-lg font-black text-xs tracking-widest hover:bg-[#2f334d] transition-all border border-[#414868] active:scale-95"
                aria-label="Xác nhận kết quả thắng giải"
              >
                CHẤP NHẬN
              </button>
              <button
                onClick={handleDrawAgain}
                disabled={remainingCount === 0}
                className={`flex-1 py-4 text-[#1a1b26] rounded-lg font-black text-xs tracking-widest hover:brightness-110 transition-all active:scale-95 border-b-4 border-black/20 ${remainingCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label="Quay lại số tiếp theo"
                style={{ 
                  backgroundColor: remainingCount !== 0 ? hudColor : '#24283b',
                  boxShadow: remainingCount !== 0 ? `0 0 15px ${hudColor}66` : 'none'
                }}
              >
                QUAY LẠI
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl w-full bg-[#1a1b26] shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-xl p-6 md:p-10 border border-[#414868] relative overflow-hidden">
        
        {drawState.isDrawing && (
          <div className={`absolute top-0 left-0 w-full p-3 text-center animate-in slide-in-from-top-full duration-500 flex items-center justify-center gap-4 border-b ${isDanger ? 'bg-red-900/20 border-red-500/30' : 'bg-[#7dcfff]/10 border-[#7dcfff]/30'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isDanger ? 'bg-red-500 animate-ping' : 'bg-[#7dcfff] animate-pulse'}`}></span>
              <span className={`text-xs font-black uppercase tracking-widest ${isDanger ? 'text-red-400' : 'text-[#7dcfff]'}`}>
                Đang quay {activePrizeLabel}
              </span>
            </div>
            <div className={`px-4 py-1 rounded-md font-black text-lg border transition-all duration-300 ${isDanger ? 'bg-red-600 text-white border-red-400 animate-bounce shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-[#1a1b26] text-[#7dcfff] border-[#7dcfff] shadow-[0_0_10px_rgba(125,207,255,0.3)]'}`}>
              {drawState.secondsRemaining}s
            </div>
          </div>
        )}

        <header className={`mb-8 text-center transition-all duration-500 ${drawState.isDrawing ? 'pt-12' : ''}`} role="banner">
          <h1 className="text-4xl font-extrabold uppercase tracking-tighter hypr-text-glow" style={{ color: hudColor }}>
            Chương Trình Quay Số
          </h1>
          <p className="text-[#565f89] font-medium uppercase tracking-[0.3em] text-[10px] mt-2">May Mắn Mỗi Ngày</p>
        </header>

        {/* PROMINENT LOW COUNT WARNING */}
        {remainingCount < 5 && (
          <div 
            key={remainingCount} 
            className={`mb-8 p-6 rounded-xl flex items-start gap-5 border shadow-2xl transition-all duration-500 animate-shake-heavy animate-warning-pulse ${
              remainingCount === 0 
                ? 'bg-red-900/20 border-red-500/30 text-red-400' 
                : 'bg-amber-900/20 border-amber-500/30 text-amber-400'
            }`}
            role="alert"
          >
              <div className={`mt-1 p-3 rounded-xl shadow-sm ${remainingCount === 0 ? 'bg-red-600/80 text-white animate-pulse' : 'bg-amber-600/80 text-white animate-bounce'}`} aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="font-black text-xl uppercase tracking-widest">
                    {remainingCount === 0 ? 'CẢNH BÁO: HẾT SỐ!' : 'CHÚ Ý: SỐ LƯỢNG CÒN RẤT ÍT!'}
                  </h4>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${remainingCount === 0 ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>
                    {remainingCount === 0 ? 'Danger' : 'Priority'}
                  </span>
                </div>
                <p className="text-sm font-bold opacity-80 leading-tight mb-2">
                  {remainingCount === 0 
                    ? `Tất cả ${maxRange} số đã được sử dụng. Bạn phải RESET để tiếp tục.` 
                    : `Chỉ còn vỏn vẹn ${remainingCount} con số duy nhất chưa lộ diện.`}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-medium opacity-60 italic">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hãy cân nhắc đặt lại danh sách giải thưởng để đảm bảo tính ngẫu nhiên tốt nhất.
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-[#414868] shadow-2xl mb-8">
          <table className="w-full border-collapse bg-[#1a1b26]">
            <thead>
              <tr className="bg-[#24283b] text-[#c0caf5]">
                <th className="p-4 text-center w-20 border-r border-[#414868] text-[10px] tracking-widest">CHỌN</th>
                <th className="p-4 text-left w-32 md:w-40 border-r border-[#414868] text-[10px] tracking-widest">GIẢI</th>
                <th className="p-4 text-left text-[10px] tracking-widest">KẾT QUẢ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#414868]">
              {PRIZES.map((prize) => {
                const isSelected = selectedPrize === prize.id;
                const isTargeted = drawState.isDrawing && drawState.targetPrize === prize.id;
                const isWinner = lastSessionWinner?.prizeId === prize.id;
                const prizeResults = results[prize.id];

                return (
                  <tr 
                    key={prize.id} 
                    onClick={() => !drawState.isDrawing && setSelectedPrize(prize.id)}
                    className={`transition-all duration-300 cursor-pointer relative group ${
                      isSelected 
                        ? 'bg-[#24283b]/50 ring-1 ring-[#7dcfff]/20 ring-inset z-10' 
                        : 'hover:bg-[#1f2335]'
                    }`}
                  >
                    <td className={`p-4 text-center border-r border-[#414868] transition-all duration-300 ${
                      isSelected ? 'border-l-[4px] shadow-[inset_4px_0_10px_rgba(125,207,255,0.1)]' : 'border-l-[4px] border-l-transparent'
                    }`} style={{ borderLeftColor: isSelected ? hudColor : undefined }}>
                      <div 
                        key={isSelected ? `active-${prize.id}` : `inactive-${prize.id}`}
                        className={`flex justify-center ${isSelected ? 'animate-radio-zoom-shake' : ''}`}
                      >
                        <input
                          type="radio"
                          name="prizeSelection"
                          id={`prize-${prize.id}`}
                          checked={isSelected}
                          onChange={() => !drawState.isDrawing && setSelectedPrize(prize.id)}
                          disabled={drawState.isDrawing}
                          className="w-5 h-5 cursor-pointer transition-transform"
                          style={{ accentColor: hudColor }}
                          aria-label={`Chọn ${prize.label}`}
                        />
                      </div>
                    </td>
                    <td className="p-4 border-r border-[#414868] transition-all" style={{ color: isSelected || isWinner ? hudColor : '#a9b1d6', fontWeight: isSelected || isWinner ? 900 : 400 }}>
                      <label 
                        key={`${prize.id}-${isSelected}-${isWinner}`}
                        htmlFor={`prize-${prize.id}`} 
                        className={`cursor-pointer block w-full whitespace-nowrap font-bold transition-all duration-300 origin-left text-xs tracking-wider ${
                          isWinner 
                            ? 'animate-winner-label-glow text-sm' 
                            : isSelected 
                              ? 'animate-gentle-label-pulse' 
                              : 'scale-100'
                        }`}
                      >
                        {prize.label}
                      </label>
                    </td>
                    <td className={`p-4 min-h-[70px] relative transition-colors duration-500 ${isWinner ? 'animate-shimmer-victory' : ''}`}>
                      <div className={`flex flex-wrap items-center gap-2 transition-transform duration-300 origin-left ${
                        isSelected ? 'scale-[1.02]' : 'scale-100'
                      }`}>
                        {prizeResults.length > 0 && (
                          <span className={`text-lg font-bold font-mono text-[#c0caf5] bg-[#24283b] border border-[#414868] px-3 py-1 rounded shadow-[0_2px_10px_rgba(0,0,0,0.3)] animate-pop-in ${
                            isWinner ? 'animate-highlight-vibrate ring-1 ring-[#bb9af7] border-[#bb9af7] shadow-[0_0_15px_rgba(187,154,247,0.4)]' : ''
                          }`}>
                            {prizeResults.join(' :: ')}
                          </span>
                        )}
                        
                        {isTargeted && (
                          <div className="flex items-center gap-4 ml-2">
                            {prizeResults.length > 0 && <span className="text-[#565f89] font-bold">|</span>}
                            <div className="relative flex items-center justify-center p-1">
                      <svg className="w-20 h-20 transform -rotate-90">
                                <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-[#24283b]" />
                                <circle
                                  cx="40" cy="40" r={radius}
                                  stroke={isSelected ? hudColor : 'currentColor'} strokeWidth="4" fill="transparent"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={dashOffset}
                                  strokeLinecap="round"
                                  className={`transition-all duration-100 ease-linear ${
                                    isDanger ? 'text-[#f7768e]' : !isSelected ? 'text-[#7dcfff]' : ''
                                  }`}
                                  style={{ color: isSelected && !isDanger ? hudColor : undefined }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`text-[9px] font-black leading-none mb-0.5 transition-colors duration-300 ${isDanger ? 'text-[#f7768e] animate-pulse' : 'text-[#565f89]'}`} style={{ color: isSelected && !isDanger ? hudColor : undefined }}>
                                  {drawState.secondsRemaining}s
                                </span>
                                <span className={`text-2xl font-black font-mono leading-none drop-shadow-sm transition-all duration-300 ${isDanger ? 'text-[#f7768e] scale-110' : 'scale-100'} ${drawState.isDrawing ? 'animate-pulse' : ''}`} style={{ color: isSelected && !isDanger ? hudColor : '#c0caf5' }}>
                                  {drawState.rollingNumber}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MAIN HUD COUNTDOWN & ROLLING NUMBER (REFINED VISUAL TIMER) */}
        {drawState.isDrawing && (
          <div className="mb-12 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
            <div className="relative flex items-center justify-center group scale-110 md:scale-125">
              {/* Outer Glow Ring */}
              <div 
                className="absolute inset-[-40px] rounded-full opacity-20 blur-3xl animate-pulse transition-colors duration-500" 
                style={{ backgroundColor: timerColor }}
              ></div>
              
              {/* Scanning Lines Effect Overlay */}
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-10 opacity-30">
                <div className="h-4 w-full bg-white/20 absolute top-0 animate-scan"></div>
              </div>

              {/* Progress Ring with Double Layer */}
              <svg className="w-64 h-64 transform -rotate-90 filter drop-shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                {/* Background Track */}
                <circle cx="128" cy="128" r="115" stroke="#1a1b26" strokeWidth="16" fill="transparent" />
                {/* Secondary Ghost Track */}
                <circle
                  cx="128" cy="128" r="115"
                  stroke={timerColor} strokeWidth="16" fill="transparent"
                  strokeDasharray={2 * Math.PI * 115}
                  strokeDashoffset={2 * Math.PI * 115 - (drawState.currentProgress / 100) * (2 * Math.PI * 115)}
                  strokeLinecap="round"
                  className="opacity-10"
                />
                {/* Main Progress Stroke */}
                <circle
                  cx="128" cy="128" r="115"
                  stroke={timerColor} strokeWidth="10" fill="transparent"
                  strokeDasharray={2 * Math.PI * 115}
                  strokeDashoffset={2 * Math.PI * 115 - (drawState.currentProgress / 100) * (2 * Math.PI * 115)}
                  strokeLinecap="round"
                  className="transition-all duration-100 ease-linear"
                />
              </svg>
              
              {/* Rolling Number Display in the Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* Status Badge */}
                <div 
                  className={`px-4 py-1 rounded-full text-[9px] font-black tracking-[0.5em] mb-2 transition-all duration-300 ${isUrgent ? 'bg-red-600 text-white animate-bounce' : 'bg-[#1f2335] text-[#565f89]'}`}
                  style={{ color: !isUrgent ? timerColor : undefined }}
                >
                  {timerLabel}
                </div>

                <div 
                  className={`text-9xl font-black font-mono tracking-tighter transition-all duration-75 drop-shadow-[0_0_15px_rgba(0,0,0,0.9)] ${isUrgent ? 'animate-shake-heavy' : ''}`}
                  style={{ color: timerColor }}
                >
                  {drawState.rollingNumber}
                </div>
                
                {/* Prominent High-Visibility Remaining Seconds */}
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className={`text-5xl font-black tabular-nums transition-all duration-300 ${isUrgent ? 'scale-110' : ''}`} style={{ color: timerColor }}>
                    {drawState.secondsRemaining}
                  </span>
                  <span className="text-xs font-black opacity-40 uppercase" style={{ color: timerColor }}>Giây</span>
                </div>
              </div>

              {/* Decorative Corner Brackets (Tech Style) */}
              <div className="absolute -top-6 -left-6 w-10 h-10 border-t-4 border-l-4 opacity-50 rounded-tl-xl" style={{ borderColor: timerColor }}></div>
              <div className="absolute -top-6 -right-6 w-10 h-10 border-t-4 border-r-4 opacity-50 rounded-tr-xl" style={{ borderColor: timerColor }}></div>
              <div className="absolute -bottom-6 -left-6 w-10 h-10 border-b-4 border-l-4 opacity-50 rounded-bl-xl" style={{ borderColor: timerColor }}></div>
              <div className="absolute -bottom-6 -right-6 w-10 h-10 border-b-4 border-r-4 opacity-50 rounded-br-xl" style={{ borderColor: timerColor }}></div>
            </div>
            
            <div className="mt-16 text-center flex flex-col items-center gap-2">
              <div className="flex items-center gap-6 text-[#565f89] font-black text-[10px] tracking-[0.6em] uppercase">
                <span className="w-16 h-px bg-current opacity-20"></span>
                {isUrgent ? 'THREAT LEVEL: CRITICAL' : isWarning ? 'THREAT LEVEL: MODERATE' : 'SYSTEM STATUS: STABLE'}
                <span className="w-16 h-px bg-current opacity-20"></span>
              </div>
              <p className="text-xs font-bold text-[#414868] animate-pulse uppercase tracking-widest">
                Computing selection algorithm ... {Math.floor(drawState.currentProgress)}%
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 bg-[#24283b]/30 p-6 rounded-xl border border-[#414868]">
          <div className="flex flex-col gap-8">
            {/* Draw Duration Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#24283b] rounded-lg border border-[#414868]" style={{ color: hudColor }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-[#c0caf5] font-black text-xs uppercase tracking-widest">Thời gian quay</h4>
                  <p className="text-[#565f89] text-[9px] font-medium uppercase tracking-tighter mt-1">Adjust execution speed</p>
                </div>
              </div>
              
              <div className="flex-1 max-w-xs flex items-center gap-4">
                <input 
                  type="range" 
                  min="3" 
                  max="15" 
                  value={drawDuration}
                  onChange={(e) => setDrawDuration(parseInt(e.target.value))}
                  disabled={drawState.isDrawing}
                  className="flex-1 h-1.5 bg-[#24283b] rounded-lg appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ accentColor: hudColor }}
                  aria-label="Thời gian quay thưởng"
                  aria-valuemin={3}
                  aria-valuemax={15}
                  aria-valuenow={drawDuration}
                />
                <div className="min-w-[60px] bg-[#1a1b26] border rounded-lg px-3 py-1.5 text-center shadow-lg transition-all duration-300" style={{ borderColor: hudColor, boxShadow: `0 0 10px ${hudColor}33` }} aria-live="polite">
                  <span className="font-black text-lg" style={{ color: hudColor }}>{drawDuration}</span>
                  <span className="font-bold text-[10px] ml-1" style={{ color: hudColor }}>S</span>
                </div>
              </div>
            </div>

            {/* Theme Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-[#414868]/50 pt-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#24283b] rounded-lg border border-[#414868]" style={{ color: hudColor }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-[#c0caf5] font-black text-xs uppercase tracking-widest">Giao diện HUD</h4>
                  <p className="text-[#565f89] text-[9px] font-medium uppercase tracking-tighter mt-1">Select theme color profile</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {HUD_THEMES.map((theme) => (
                  <button
                    key={theme.color}
                    onClick={() => setHudColor(theme.color)}
                    disabled={drawState.isDrawing}
                    className={`w-8 h-8 rounded border-2 transition-all duration-300 hover:scale-110 active:scale-95 ${hudColor === theme.color ? 'scale-110 shadow-lg' : 'opacity-40 grayscale-[0.5]'}`}
                    style={{ 
                      backgroundColor: theme.color, 
                      borderColor: hudColor === theme.color ? '#ffffff' : 'transparent',
                      boxShadow: hudColor === theme.color ? `0 0 10px ${theme.color}` : 'none'
                    }}
                    title={theme.name}
                    aria-label={`Chọn chủ đề màu ${theme.name}`}
                    aria-pressed={hudColor === theme.color}
                  />
                ))}
              </div>
            </div>

            {/* Digit Range Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-[#414868]/50 pt-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#24283b] rounded-lg border border-[#414868]" style={{ color: hudColor }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-[#c0caf5] font-black text-xs uppercase tracking-widest">Cấu hình dãy số</h4>
                  <p className="text-[#565f89] text-[9px] font-medium uppercase tracking-tighter mt-1">Digit range configuration</p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                {DIGIT_OPTIONS.map((num) => (
                  <button
                    key={num}
                    onClick={() => handleDigitCountChange(num)}
                    disabled={drawState.isDrawing}
                    className={`px-4 py-2 rounded-lg font-black text-xs transition-all duration-300 border-2 ${
                      digitCount === num 
                        ? 'bg-[#24283b] shadow-lg scale-110' 
                        : 'bg-[#1a1b26] border-[#414868] opacity-60 grayscale hover:opacity-100 hover:grayscale-0'
                    }`}
                    style={{ 
                      color: digitCount === num ? hudColor : '#c0caf5',
                      borderColor: digitCount === num ? hudColor : undefined 
                    }}
                    aria-label={`Chọn cấu hình ${num} chữ số`}
                    aria-pressed={digitCount === num}
                  >
                    {num} SỐ (0-{ '9'.repeat(num) })
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => startDraw(drawDuration)}
              disabled={drawState.isDrawing || remainingCount === 0}
              className={`
                relative py-5 px-6 rounded-lg font-black text-xs uppercase tracking-[0.3em] shadow-xl transform active:scale-95 transition-all
                ${drawState.isDrawing || remainingCount === 0
                   ? 'bg-[#24283b] text-[#414868] cursor-not-allowed border-none' 
                   : 'text-[#1a1b26] hover:brightness-110 border-b-4 border-black/20'}
              `}
              style={{ 
                backgroundColor: !(drawState.isDrawing || remainingCount === 0) ? hudColor : undefined,
                boxShadow: !(drawState.isDrawing || remainingCount === 0) ? `0 0 20px ${hudColor}33` : undefined
              }}
            >
              {drawState.isDrawing && drawState.totalDuration === drawDuration ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-[#1a1b26]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  EXECUTING...
                </span>
              ) : `START DRAW (${drawDuration}s)`}
            </button>

            <button
              onClick={() => startDraw(3)}
              disabled={drawState.isDrawing || remainingCount === 0}
              className={`
                relative py-5 px-6 rounded-lg font-black text-xs uppercase tracking-[0.3em] shadow-xl transform active:scale-95 transition-all
                ${drawState.isDrawing || remainingCount === 0
                  ? 'bg-[#24283b] text-[#414868] cursor-not-allowed border-none' 
                  : 'bg-[#bb9af7] text-[#1a1b26] hover:bg-[#d699b6] border-b-4 border-[#8b5cf6] shadow-[0_0_20px_rgba(187,154,247,0.2)]'}
              `}
            >
              {drawState.isDrawing && drawState.totalDuration === 3 ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-[#1a1b26]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  FAST EXEC...
                </span>
              ) : 'FAST DRAW (3s)'}
            </button>
          </div>

          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={drawState.isDrawing}
            className={`
              w-full py-4 rounded-lg font-black text-xs uppercase tracking-[0.3em] transition-all
              ${drawState.isDrawing 
                ? 'opacity-20 cursor-not-allowed' 
                : 'bg-[#1a1b26] text-[#f7768e] border-2 border-[#f7768e] hover:bg-[#f7768e]/10'}
            `}
          >
            RESET SYSTEM
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap justify-between items-center text-[10px] font-bold uppercase text-[#565f89] tracking-[0.2em]">
            <div className="flex gap-6">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9ece6a] shadow-[0_0_5px_rgba(158,206,106,0.5)]"></span>
                CÒN LẠI: <span key={remainingCount} className={`text-[#c0caf5] transition-all ${drawState.isDrawing ? '' : 'animate-subtle-bounce'}`}>{remainingCount}/{maxRange}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_rgba(125,207,255,0.5)]" style={{ backgroundColor: hudColor }}></span>
                ĐÃ DÙNG: <span key={usedNumbers.size} className={`text-[#c0caf5] transition-all ${drawState.isDrawing ? '' : 'animate-subtle-bounce'}`}>{usedNumbers.size}/{maxRange}</span>
              </span>
            </div>
            <div className="mt-1 sm:mt-0 text-[9px] text-[#414868] font-medium tracking-widest">MODE: UNIQUE_ONLY</div>
          </div>
        </div>
      </div>
      
      <p className="mt-8 text-[#565f89] text-[10px] text-center max-w-md px-4 leading-relaxed font-medium uppercase tracking-wider">
        Hệ thống tự động loại bỏ các số đã trúng thưởng. Kết quả hiển thị tại cột 3 và được lưu trữ liên tục. 
        Nhấn RESET để xóa sạch kết quả.
      </p>

      <footer className="mt-12 py-8 border-t border-[#24283b] w-full flex justify-center" role="contentinfo">
        <p className="text-[#414868] font-mono text-[10px] tracking-[0.4em] uppercase opacity-80 hover:opacity-100 transition-opacity cursor-default">
          © Anamatagga Saṃsāra
        </p>
      </footer>
    </div>
  );
};

export default App;