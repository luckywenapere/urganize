'use client';

import { useEffect, useLayoutEffect } from 'react';

// A layout effect runs after the DOM is committed but BEFORE the browser
// paints, which makes it the only place to correct what a server-rendered page
// shows without the user seeing the uncorrected frame first.
//
// Both front-door pages need that window. They are server-rendered so the form
// is on screen the moment the HTML lands (see the bug report of 2026-08-12: a
// user on a weak mobile connection sat on a bare loading screen and could not
// sign up), but the server cannot know what is in the visitor's browser
// storage — a saved onboarding draft, or an existing session. Reading that in a
// plain useEffect would paint the wrong step, or flash a login form at someone
// who is already signed in.
//
// useLayoutEffect does nothing on the server and warns if called there, so
// alias to useEffect during SSR. The client is the only place it has to work.
export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
