import ConfusedRive from './face/Confused.riv';
import CuriousRive from './face/Curious.riv';
import ExcitedRive from './face/Excited.riv';
import HappyRive from './face/Happy.riv';
import SadRive from './face/Sad.riv';
import ThinkRive from './face/Think.riv';
import ConfusedVideo from './dogbot/Oswald_Confused.mp4';
import FastBlinkVideo from './dogbot/Oswald_FastBlink.mp4';
import LongWinkVideo from './dogbot/Oswald_LongWink.mp4';
import SleepVideo from './dogbot/Oswald_Sleep.mp4';
import ThinkVideo from './dogbot/Oswald_Think.mp4';
import WinkVideo from './dogbot/Oswlad_Wink.mp4';

export const BUILT_IN_FACES = {
  confused: { mp4: ConfusedVideo, rive: ConfusedRive },
  curious: { mp4: WinkVideo, rive: CuriousRive },
  excited: { mp4: FastBlinkVideo, rive: ExcitedRive },
  happy: { mp4: LongWinkVideo, rive: HappyRive },
  sad: { mp4: SleepVideo, rive: SadRive },
  think: { mp4: ThinkVideo, rive: ThinkRive },
} as const;

export type FaceName = keyof typeof BUILT_IN_FACES;
export type AnimationFormat = keyof (typeof BUILT_IN_FACES)[FaceName];
