import type { EpisodeClass } from '@/types/analytics';
import { ANALYTICS_CONFIG } from './config';
export function episodeClassification(lowMs:number,unknownMs:number): EpisodeClass {
  const measured=lowMs+unknownMs;
  if(measured<=0) return 'mixed';
  if(lowMs/measured>=ANALYTICS_CONFIG.dominanceThreshold) return 'looking_away';
  if(unknownMs/measured>=ANALYTICS_CONFIG.dominanceThreshold) return 'tracking_uncertain';
  return 'mixed';
}
