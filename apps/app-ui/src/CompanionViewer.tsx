import React from 'react';

export type CompanionAvatarId =
  | 'orb'
  | 'robot'
  | 'cat'
  | 'owl'
  | 'crescent'
  | 'sprout'
  | 'lantern';

export type CompanionVisualState =
  | 'idle'
  | 'focus'
  | 'prayer'
  | 'celebration'
  | 'review';

export type CompanionSize = 'small' | 'normal' | 'large';

export interface CompanionViewerProps {
  avatar?: string;
  state?: CompanionVisualState;
  size?: CompanionSize;
  className?: string;
}

export function CompanionViewer({
  avatar = 'orb',
  state = 'idle',
  size = 'normal',
  className = '',
}: CompanionViewerProps) {
  const activeAvatar = ['robot', 'orb', 'cat', 'owl', 'crescent', 'sprout', 'lantern'].includes(avatar)
    ? avatar
    : 'orb';

  return (
    <div
      className={`wens-avatar avatar-${activeAvatar} state-${state} size-${size} ${className}`}
      aria-hidden="true"
    >
      <span className="wens-shadow" />
      <span className="wens-aura" />
      <span className="wens-body">
        {/* Orb specific layers */}
        <span className="orb-specular" />
        <span className="orb-crevice" />
        <span className="orb-core" />
        <span className="orb-orbit" />

        {/* Robot specific layers */}
        <span className="robot-antenna">
          <i className="antenna-tip" />
        </span>
        <span className="robot-ears">
          <i className="ear ear-right" />
          <i className="ear ear-left" />
        </span>
        <span className="wens-face">
          <i className="eye eye-right" />
          <i className="eye eye-left" />
          <i className="smile" />
        </span>
        <span className="robot-chest-core" />

        {/* Cat specific layers */}
        <span className="cat-ears">
          <i className="cat-ear ear-right"><i className="inner-ear" /></i>
          <i className="cat-ear ear-left"><i className="inner-ear" /></i>
        </span>
        <span className="cat-tail"><i className="tail-tip" /></span>
        <span className="cat-belly" />
        <span className="cat-face">
          <i className="cat-eye eye-right" />
          <i className="cat-eye eye-left" />
          <i className="cat-nose" />
          <i className="cat-mouth" />
        </span>
        <span className="cat-whiskers">
          <i className="whisker whisker-r1" />
          <i className="whisker whisker-r2" />
          <i className="whisker whisker-l1" />
          <i className="whisker whisker-l2" />
        </span>

        {/* Owl specific layers */}
        <span className="owl-tufts">
          <i className="tuft tuft-right" />
          <i className="tuft tuft-left" />
        </span>
        <span className="owl-belly" />
        <span className="owl-face">
          <span className="owl-eye-wrap eye-right">
            <i className="owl-eye-frame" />
            <i className="owl-pupil" />
          </span>
          <span className="owl-eye-wrap eye-left">
            <i className="owl-eye-frame" />
            <i className="owl-pupil" />
          </span>
          <i className="owl-beak" />
        </span>
        <span className="owl-wings">
          <i className="wing wing-right" />
          <i className="wing wing-left" />
        </span>

        {/* Crescent specific layers */}
        <span className="crescent-body-curve" />

        {/* Plant / Sprout specific layers */}
        <span className="sprout-pot">
          <i className="pot-rim" />
        </span>
        <span className="sprout-stem" />
        <span className="sprout-leaves">
          <i className="sprout-leaf leaf-right" />
          <i className="sprout-leaf leaf-left" />
        </span>
        <span className="sprout-bud" />

        {/* Lantern specific layers */}
        <span className="lantern-ring" />
        <span className="lantern-cap" />
        <span className="lantern-glass">
          <span className="lantern-flame">
            <i className="flame-inner" />
          </span>
        </span>
        <span className="lantern-frame">
          <i className="frame-bar bar-1" />
          <i className="frame-bar bar-2" />
        </span>
        <span className="lantern-base" />

        {/* General / Legacy layers */}
        <span className="wens-leaf" />
        <span className="wens-mark">و</span>
      </span>
    </div>
  );
}
