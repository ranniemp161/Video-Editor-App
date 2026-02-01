
import { Asset } from './types';

export const ASSETS: Asset[] = [
  {
    id: 'video1',
    type: 'video',
    name: 'Waterfall',
    src: 'https://assets.mixkit.co/videos/preview/mixkit-waterfall-in-forest-2213-480.mp4',
    duration: 15.0,
  },
  {
    id: 'video2',
    type: 'video',
    name: 'Ocean Sunset',
    src: 'https://assets.mixkit.co/videos/preview/mixkit-sun-setting-down-in-the-middle-of-the-ocean-3820-480.mp4',
    duration: 17.0,
  },
  {
    id: 'video3',
    type: 'video',
    name: 'Mountain Range',
    src: 'https://assets.mixkit.co/videos/preview/mixkit-very-close-shot-of-the-mountains-3119-480.mp4',
    duration: 15.0,
  },
  {
    id: 'video4',
    type: 'video',
    name: 'City Traffic',
    src: 'https://assets.mixkit.co/videos/preview/mixkit-traffic-in-an-avenue-of-a-city-at-dusk-4234-480.mp4',
    duration: 15.0,
  },
];

export const TIMELINE_CONSTANTS = {
  PIXELS_PER_SECOND: 50,
  TRACK_HEIGHT: 60,
  TRACK_GAP: 5,
};
