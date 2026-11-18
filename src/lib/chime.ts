import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;
let ringing = false;

function getPlayer(): AudioPlayer {
  if (!player) {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    player = createAudioPlayer(require('../../assets/sounds/new-order.wav'));
    player.loop = true;
  }

  return player;
}

export function startChime() {
  if (ringing) {
    return;
  }

  ringing = true;
  const chime = getPlayer();
  void chime.seekTo(0).finally(() => {
    if (ringing) {
      chime.play();
    }
  });
}

export function stopChime() {
  if (!ringing) {
    return;
  }

  ringing = false;
  player?.pause();
}
