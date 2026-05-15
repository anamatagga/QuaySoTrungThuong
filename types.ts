
export type PrizeId = 
  | 'DAC_BIET'
  | 'GIAI_NHAT'
  | 'GIAI_NHI'
  | 'GIAI_BA'
  | 'GIAI_TU'
  | 'GIAI_NAM'
  | 'GIAI_SAU'
  | 'GIAI_BAY'
  | 'GIAI_TAM';

export interface PrizeInfo {
  id: PrizeId;
  label: string;
}

export interface DrawingState {
  isDrawing: boolean;
  rollingNumber: string;
  targetPrize: PrizeId | null;
  secondsRemaining: number;
  totalDuration: number;
}
