// Sit: a girl on a tall chair, her feet not reaching the floor, swings her legs. Happy: she kicks them out straight and holds them there, grinning.
// Sad: on a swing her left shoe slips off and drops to the floor out of reach; she looks down at it, pouting. The still's own shapes on real joints,
// turned by the shared rig (rig.js). Every frame is a pure function of t, in seconds. (One bundle of the rig's sit/ story files.)
// sit/body.mjs
import { makeTformRig } from "./rig.js";
var STILL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="var(--art-violet,#7C5CE6)"/><path d="M-1.6 166.3l203.2 0 0 35.3-203.2 0z" fill="var(--art-violet-lit,#A68CFF)"/><path d="M52.6 189.5l36.7-12.1 63.8 2.5-3.2 5.1-38.3 8.6-47.8-1.3z" fill="var(--art-violet-deep,#5E40C4)"/><path d="M135.6 56.8q.3-1.3 1.9-1.3l6 0q1.6.3 1.3 2.2l-6.7 65.4 0 58.4-10.2 0 .3-58.4zM90.3 134l9.5 0 0 46.5-9.5 0zM95.7 63.8l6.4 0-.7 59-6 0zM95.7 63.5l41.8-.3-.3 8.6-41.5.3zM95.7 84.2l40.8-.3-.3 8.6-40.5.3z" fill="var(--art-wood,#DCA063)"/><path d="M141.3 55.8l2.2-.3q1.6.3 1.3 2.2l-6.7 65.4 0 58.4-4.1 0 .3-58.4zM96.3 134l3.5 0 0 46.5-3.5 0zM95.7 70.2l41.5-.3 0 1.9-41.5.3zM95.7 90.9l40.5-.3 0 1.9-40.5.3z" fill="var(--art-bark,#7A4E2D)"/><path d="M50.7 122.8l60.9 4.8 27.8-7.7-60.9-4.1z" fill="var(--art-wood,#DCA063)"/><path d="M50.7 122.8l60.9 4.8 0 7.6-60.9-5.7z" fill="var(--art-wood-deep,#B97F45)"/><path d="M111.6 127.6l27.8-7.7 0 7.1-27.8 8.2z" fill="var(--art-bark,#7A4E2D)"/><path d="M50.4 129.5l7.3.6-.9 59.7-6.1 0zM104 135.2l8.9.7 0 57.1-8.3 0z" fill="var(--art-wood,#DCA063)"/><path d="M55.2 130l2.5.1-.9 59.7-1.9 0zM109.7 135.6l3.2.3 0 57.1-2.9 0z" fill="var(--art-bark,#7A4E2D)"/><path d="M62.2 117.4c-4.9 3.2-4.9 7.4.2 26.6 1.7 6.3 2.8 11.6 2.6 13.1-.1 2.3-.1 2.3 3.8 2.5 6.2.3 6 1 4.4-17.4-1.6-17.1-1.3-22.2.7-13.2 1.1 5 1.6 4.7 1.4-.6-.2-4.2-.4-4.8-1.6-5.4-.8-.3-1.8-1.4-2.2-2.4-1.6-3.9-5.8-5.3-9.3-3.2z" fill="var(--art-skin,#E9B48A)"/><path d="M69.6 123.5c-.8 1.4-.7 3.5.8 14.6 .5 4 1 5.7 1.5 5.7 1.1 0 1.3-5.5.2-12.5-.5-4.3-.5-5 .5-6.1 .9-1 .9-1.4.2-2.2-1.1-1.3-2.3-1.2-3.2.5z" fill="var(--art-skin-deep,#CF9468)"/><path d="M70.3 144.3c-.9.3-3 .6-4.7.6-2.7.1-3 .2-2.7 1 1.5 4.8 2.5 9.9 2.1 11.2-.7 2.7-.7 2.7 3.7 2.7 4.7 0 6.5-1.8 5.5-5.6-.2-1-.6-3.8-.8-6.3-.3-4.7-.3-4.6-3.1-3.6z" fill="var(--art-paper,#FBF7EC)"/><path d="M78.5 118.5c-.9.5-2 1.9-2.5 3-.4 1.2-1.2 2.7-1.8 3.2-1.2 1.5-.7 4.2 3.2 19.6 1.8 6.9 3 13.3 3 14.7-.2 2.3-.2 2.3 3.4 2.5 3.9.2 5.8-1 5.8-3.8 0-2.3-2-25.4-2.4-28.5-.3-1.5-.2-2.7.1-2.7 1.8 0 2.2-1.1 1.2-2.9-.5-1-1-2.2-1-2.6 0-2.5-6-4.2-9-2.5z" fill="var(--art-skin,#E9B48A)"/><path d="M85.3 124c-1.7 1.9.4 21 2.3 21 .8 0 .7-7.2-.1-13.1-.8-4.9-.7-5.4 1.6-6.2 .7-.3-1-3-1.9-3-.4 0-1.3.6-1.9 1.3z" fill="var(--art-skin-deep,#CF9468)"/><path d="M86.1 145.4c-.9.3-3.1.6-4.9.6-1.8 0-3.2.2-3.2.4 0 .3.6 2.5 1.2 5.1 1.2 4.4 1.3 6.7.5 8.9-.3.7 0 .8 4 .8 4.8 0 7.1-2.1 5.8-5.3-.2-.7-.6-3.4-.7-6-.5-5.6-.4-5.5-2.7-4.5z" fill="var(--art-paper,#FBF7EC)"/><path d="M73.7 157.9c-3 5.8-7.3 8.1-9.7 5.2-1-1.2-.9-1.4-3.2 3.1-2.2 4.3-2.3 4.9-.9 6.8 4.8 6.1 20.1-9.9 15.5-16.3-.6-.9-.7-.8-1.7 1.2z" fill="var(--art-ink-lit,#3A3460)"/><path d="M88.7 159.9c-3 5.1-6.9 7.1-9.3 4.7-1.2-1.3-1.4-1.2-3.5 3-2 3.7-2.2 5.7-.8 7 5.4 5.4 20.2-10.2 15.7-16.5-.6-.7-.8-.6-2.1 1.8z" fill="var(--art-ink-lit,#3A3460)"/><path d="M60.8 111.1c-1 1-1.2 1.8-1 3.1 .2 1-.1 2.6-.6 3.7-1.4 2.5-1.4 7.7 0 8.2 1.6.7 11.6.5 12-.2 .2-.4.9-.7 1.6-.7 .6 0 1.6-.5 2-1.2 .9-1.2 2.1-1.3 15.2-1.8 16.6-.7 15.8-.4 14-6.5l-1.5-4.8-14-.1c-7.7-.1-14.7-.1-15.5-.2-.8-.1-1.9-.1-2.5-.1-.7.1-2.8-.1-4.7-.3-3.2-.4-3.8-.3-5 .9z" fill="var(--art-skin,#E9B48A)"/><path d="M78.3 111.2c-.9.8-1.6 2-1.6 2.9 0 .8-.7 2.3-1.6 3.2-1.6 1.7-2.3 6.8-1.2 9.5 .7 1.9 10.9 1.4 14.7-.8 2.8-1.6 3.9-1.8 13.6-2.4l10.6-.6-.1-3.8c-.1-7.8.5-7.4-11-7.4-7.5 0-10.4-.2-11.6-.9-2.6-1.5-9.7-1.3-11.8.3z" fill="var(--art-skin,#E9B48A)"/><path d="M85.6 123.4c-2.4 2.4-1.3 5.8 1.2 3.4 .6-.5 1.3-1 1.6-1 1.3 0 2.6-1.8 2-2.8-.7-1.5-3.1-1.3-4.8.4z" fill="var(--art-skin-deep,#CF9468)"/><path d="M75.7 109.1c-1.2 2.9-3.6 4.7-5.9 4.3-2.4-.4-1.9 1.8.8 3.1 3.6 1.7 5.2 1.1 6.6-2.3 .6-1.4 2-3.5 3.1-4.5 2.8-2.7 2.7-3.3-.7-3.3-2.4 0-3 .4-3.9 2.7zM95.8 109.4c-2 1.6-4.8 3.6-6.1 4.4-3.5 1.9-3.8 3.2-1.2 7 1.9 2.9 2.1 3.5 1.2 5-1.7 2.7.1 3.4 9.9 3.7 10.2.3 12.3-.1 10.9-1.8-1.1-1.4-.9-1.5 4.9-3.2 7-2 10.4-10.1 7-16.6-1.8-3.3-22-2.1-26.6 1.5z" fill="var(--art-clay,#E8743B)"/><path d="M75.3 109.8c-2.1 4.3-2.1 4.6-.2 4.6 1.9 0 5.3-5.1 4.6-6.8-.8-2.2-2.7-1.2-4.4 2.2zM114.2 110.2c-1.3 2.8-2.9 4.5-5.8 6.3-12.6 7.9-15.2 14.6-4.1 10.9 2.7-1 7.1-2.1 9.6-2.7 7.1-1.3 9.3-3.8 9.3-10.3 0-9.2-5.4-11.8-9-4.2z" fill="var(--art-clay-deep,#C25626)"/><path d="M91.1 45.5c-6.6 3.6-6.7 10.1-.2 10.1 2.8 0 3.9 2.5 2 4.5-1.1 1.2-1 7.8.1 9.5 .9 1.5 12.4.9 12.7-.8 .9-4.2.9-9 .1-10.3-2.1-3-2-7.6.2-9.7 3.4-3.5-9.5-6.3-14.9-3.3z" fill="var(--art-skin,#E9B48A)"/><path d="M103.6 48.5c-.7 1-3.2 2.8-5.6 4-6.3 3.2-6 6.2.7 5.3 2.9-.4 3.3-.2 4.6 1.2 2.3 2.7 4.2 2.3 2.5-.4-1.5-2.4-2-7.2-.8-9.1 2.1-3 .9-4-1.4-1z" fill="var(--art-skin-deep,#CF9468)"/><path d="M106.7 61.7c-4.7 5.3-11.5 6.1-13.8 1.7-1.9-3.7-8.3 0-12.7 7.6-2.4 4.2-2 5.4 2.5 7.3 7.9 3.5 8.4 21.1.7 24.8-3.7 1.9-3.7 1.9-1.8 2.7 6.9 2.5 18.1-7.8 21.9-20.4 1.9-6.3 3.8-7.3 9.9-5.8 3.6.9-1.2 15.2-7.1 21.4-4.7 4.9-4.1 5.4 6 5.4 9.6 0 9.9-.5 6.5-8.4-3.4-7.7-3.4-12.6.2-15.6 4.6-4 .1-17.2-7.2-20.9-3.6-1.8-3.2-1.8-5.1.2z" fill="var(--art-clay,#E8743B)"/><path d="M108.8 61.4c0 .3 1 1.5 2.1 2.7 1.8 1.9 2.1 3.1 2.5 8.1 .1 3.2.7 6.6 1.2 7.6 1.6 3.3-4.5 18.3-9 22-4.2 3.6-2.2 5.3 4.2 3.8 2.5-.5 4.4-.5 6 .1 6.1 2.1 6.5-1.5 1.3-11.5-1.7-3.4-.9-9.5 1.9-11.8 3.8-3.3.4-16-5.3-19.8-2.7-1.8-4.9-2.4-4.9-1.2zM84.8 74c-1 2.7-1 4.2.1 4.9 1.2.7 2.3-1.1 2.3-3.9 0-2.9-1.4-3.6-2.4-1z" fill="var(--art-clay-deep,#C25626)"/><path d="M83.7 22c-.6 1.3-1.5 2-2.5 2.2-2.5.3-2.9 1-3.4 6.7-.2 2.8-.6 6.7-.9 8.5-1.3 10.5 4.8 15.8 19.1 16.6 8.2.4 8.2.4 8.2-2.4 0-4 1.3-5.7 4.4-5.7 4.8 0 7.8-4.5 5.1-7.8-1.2-1.6-1.8-1.8-4.1-1.6-2.6.2-2.6.2-2.9-5.2-.3-5.4-.3-5.4-3.6-6.6-2.8-1.1-3.4-1.6-3.7-3.2-.5-2.1-.5-2.1-1.2-.4-1.1 3-12.9 1.6-13.3-1.5-.2-1.4-.3-1.4-1.2.4z" fill="var(--art-skin,#E9B48A)"/><path d="M88.3 7.2c-8.7 3.4-17.6 15.1-13.3 17.5 1.6.9 0 7-4.1 16.5-3.5 8.1-1.1 15.6 4.2 13.6 .6-.2 1.5-.1 2.1.4 1.2 1 15.4 2.9 16.1 2.2 1-1.1-.7-2.2-3.5-2.2-7.9-.1-13.4-6.8-12.6-15.2 1.7-16.6 1.4-15.6 3.6-15.8 1-.2 2.3-.9 2.9-1.6 .8-1.2.9-1.2 1.6 0 1.1 1.9 11.9 2.8 12.9 1 .6-1.1.8-1 1.6.7 .5 1.1 1.9 2.2 3.3 2.5 3.2.7 4.4 2.3 3.8 5.2-1 4.9.1 7.3 3.1 6.7 2.6-.5 5.2 1.6 5.2 4.3 0 2-3.8 5-6.3 5-3.3 0-5 2.6-4.2 6.4 .7 2.9 8 3.9 11 1.6 .5-.5 1.4-.6 2.1-.4 4.9 1.9 13.4-4.6 13.4-10.2-.1-26.7-22.2-46.4-42.9-38.2z" fill="var(--art-ink,#231F3B)"/><path d="M109.3 8.1c0 .1 1 1.5 2.2 2.8 7.2 7.9 14.1 35.6 10.5 42.2-1 2 .9 2.2 4 .4 11.3-6.2-.4-41-15.3-45.5-.8-.2-1.4-.2-1.4.1z" fill="var(--art-ink-lit,#3A3460)"/><path d="M108.9 38.6c-1.1 1.1-.3 9.2.9 9.2 3.8 0 6.2-6.2 3.3-8.5-1.2-1-3.5-1.4-4.2-.7z" fill="var(--art-skin,#E9B48A)"/><path d="M84 38.3c-.5.7.6 1.9 1.6 1.9 1.3 0 1.6-.6.7-1.5-.9-1-1.9-1.1-2.3-.4zM103.1 49c-2.2 2.3-4 3.4-8.5 5.3-3 1.2-1.7 1.7 4.3 1.7l5.5 0-.2-2.7c-.3-2.4-.2-2.8 1.1-4.2 2.5-2.9.6-3-2.2-.1z" fill="var(--art-skin-deep,#CF9468)"/><path d="M83.4 43c-.5.9.9 4 2.6 5.4 2.4 2.2 6.1.8 7.6-2.8 1-2.5 1-2.5-3.6-2.5-2.2 0-4.5-.1-5.2-.2-.7-.2-1.2-.1-1.4.1z" fill="var(--art-clay-deeper,#9C4219)"/><path d="M79.9 27.2c-1.2 1-1.2 1 1.7.7 3.2-.3 3.3-.3 2.8-1.1-.4-.8-3.3-.5-4.5.4zM94 27.7c-.1.3.5.6 1.6.8 1 .2 2.5.7 3.4 1.3 1.8 1 2.4.8 1.5-.4-1.5-1.7-5.7-2.8-6.5-1.7zM81.4 32.7c-.4.6-.7 1.6-.6 2.6 .1.9 2.3.7 2.6-.2 .8-1.8-.9-3.8-2-2.4zM94.6 33.5c-1 .6-1.1 2.5-.2 3.3 1.7 1.3 3.4-1.4 1.9-2.9-.7-.6-1.1-.7-1.7-.4z" fill="var(--art-ink,#231F3B)"/><path d="M111.7 75.6c-3.2 1.3-3.1 2.7.3 3.3 4.8 1 4.7 3.4-.2 3.4-3.7 0-3.1-.5-8.9 8.8-5 8.2-5 8.1.3 8.7 4.4.4 6.8-2.4 9.3-10.8 .4-1.5 1-2.3 2.2-3 .9-.5 1.6-1.3 1.6-1.8 0-.6.4-1.1 1.1-1.4 2.2-.8 2.2-3.8-.1-6-1.5-1.3-4-1.9-5.6-1.2z" fill="var(--art-skin,#E9B48A)"/><path d="M111.1 82.9c-.3.4-1.3 3-2.2 6-1 2.9-2.5 6.4-3.4 7.8-1.7 2.8-1.7 3.3 0 3.3 2 0 4-3 6.3-9 .6-1.8 1.6-4.1 2.2-5.2 1.5-2.8-.9-5.3-2.9-2.9z" fill="var(--art-skin-deep,#CF9468)"/><path d="M106.1 64.1c-2.3 2.3.6 14.2 3.5 14.6 5.7.9 6.1 1 5.7 2.8-.5 1.9 1.8 2.3 3.9.7 2.2-1.7.7-12.9-2.1-16.3-1.1-1.3-10.1-2.8-11-1.8z" fill="var(--art-clay,#E8743B)"/><path d="M112.6 65.9c.4.9.8 3.8.7 7.4 0 5.2.1 5.9 1.1 6.3 .9.3 1.2.7.9 1.9-.5 1.9 1.8 2.2 3.9.7 3.8-2.8-.6-17.7-5.2-17.7-2.1 0-2.2.1-1.4 1.4z" fill="var(--art-clay-deep,#C25626)"/><path d="M100.9 95.8c-1 .7-11.9 15.2-11.9 15.7 0 1.8 3.2 1.2 4.8-.8 .4-.5 2.3-2 4.3-3.5 4.7-3.4 9.6-8.1 9.6-9.2 0-2.1-4.9-3.7-6.8-2.2z" fill="var(--art-skin,#E9B48A)"/><path d="M103.5 99.4c-1.3 1.6-3.8 4.1-5.5 5.8-1.6 1.6-2.8 3.1-2.6 3.3 1 1 12.4-8.9 12.2-10.6-.3-1.8-1.6-1.3-4.1 1.5z" fill="var(--art-skin-deep,#CF9468)"/><path d="M90.4 104.1c-.6.6-1.5 1.2-1.8 1.2-1.4 0-5.7 1.7-7.5 2.9-1.7 1.1-1.7 1.1-1.7 6.2l0 5.2 3.9 0c4 0 4.4-.2 2.8-1.7-1.3-1.1.8-3.5 4.6-5.2 1.3-.6 2.8-1.6 3.3-2.1 .5-.6 2-1.9 3.4-2.8 2.9-2.1 5-4 5-4.5 0-1.2-10.8-.4-12 .8z" fill="var(--art-skin,#E9B48A)"/><path d="M97.8 106.2c-2 1.9-3 3.1-2.3 2.8 2-.8 6.7-4.5 6.7-5.4 0-1.3-.8-.8-4.4 2.6zM82.2 112.3c-1.2 1.4-2.5 4.6-1.8 4.6 .7 0 3.5-5.1 3.1-5.5-.1-.1-.7.3-1.3.9zM84.7 113.7c-.6.7-1 1.6-.9 2 .2.5.8 0 1.4-1 1.4-2 1.1-2.8-.5-1z" fill="var(--art-skin-deep,#CF9468)"/><path d="M83.1 75.6c-1.7 1.3-1.5 1.9.9 3.1 3.5 1.8 2.7 3.6-1.5 3.6-2.8 0-3.2.3-4 3.6-.4 1.3-1.3 3.9-2 5.6-1.8 4.1-1.6 4.3 3.2 5.2 3 .4 3.8.4 4.3-.1 1-1.1 3.6-7.9 3.6-9.5 0-1.1.4-1.9 1.9-3.3 4.9-4.8-1.1-12.4-6.4-8.2z" fill="var(--art-skin,#E9B48A)"/><path d="M85.9 82.8c-.2.3-.9 2.6-1.7 5.1-.7 2.6-1.7 5.5-2.1 6.5-.8 2.1-.7 2.7.6 2.7 2 0 5-7.3 4.8-11.5-.2-2.8-.8-4-1.6-2.8z" fill="var(--art-skin-deep,#CF9468)"/><path d="M79.6 71.8c-2.2 3.5-2 4.1 2.3 6.1 3.2 1.4 4.2 2.2 4.8 3.8 .8 2.1 3.3 2.8 4.5 1.2 1-1.2 1.5-11.4.6-11.7-3.8-1.1-11.4-.8-12.2.6z" fill="var(--art-clay,#E8743B)"/><path d="M85.3 71.7c-2 6.4-1.9 7.5.3 7.5 1.2 0 1.3-.4 1.3-4.1 0-3.7-.9-5.6-1.6-3.4z" fill="var(--art-clay-deep,#C25626)"/><path d="M77.2 92.4c-.5.3-1.5 1.4-2.1 2.6-3.2 5.7-4.2 7.2-6.5 9.6-3.6 3.7-3.6 9.7-.1 6.9 1.6-1.3 1.9-1.2 1.3.2-.5.9-.5 1.4 0 1.8 1.1 1.1 5.8-3.3 5.8-5.6 0-.3 1.3-2.2 2.9-3.9 5.7-6.4 6.6-8.5 4.3-10.8-1-1.1-4.2-1.5-5.6-.8z" fill="var(--art-skin,#E9B48A)"/><path d="M82 95.1c-.5.9-2 3.6-3.4 5.9-3.2 5.4-3.1 6.2.2 2.6 4.8-5.2 5.9-7.5 4.7-9.1-.6-.9-.7-.9-1.5.6z" fill="var(--art-skin-deep,#CF9468)"/><path d="M70.1 103.3c-.3.2-1.5.7-2.7 1.2-5.1 1.9-10.8 10.3-7.1 10.3 .3 0 .1.6-.3 1.2-1.1 1.7-1.1 1.7 5.2 1.4 6.1-.4 6.6-.6 3.7-1.8-1.1-.5-1.9-1.1-1.9-1.3 0-.9 1.9-3.7 2.7-4 1.3-.4 1.4.1.3 1.3-2.5 2.7-.4 3.1 2.8.6 2.2-1.7 2.8-2.5 2.8-4.1 0-.5.7-1.6 1.4-2.5 .8-.9 1.5-1.9 1.5-2.2 0-.6-7.7-.8-8.4-.1zM77.6 112c-.7 1-.9 2.1-.8 2.7 .1.6 0 1.1-.2 1.1-.3 0-.5.2-.5.5 0 .2.7.4 1.7.4 1.6 0 1.6 0 1.6-2-.1-4-.6-4.7-1.8-2.7z" fill="var(--art-skin,#E9B48A)"/><path d="M77 104.3c-.6 1-1 2-.8 2.1 .5.6 2.5-2.1 2.3-3-.2-.5-.7-.1-1.5.9zM61.6 111.5c-.6 1.4-.8 2.6-.4 3 .3.3.9-.5 1.4-2.1 1-3.4.3-4-1-.9zM64.3 112.5c-1.2 3.1-1.2 3.2-.1 3.2 .4 0 1-.8 1.1-1.8 .2-1 .6-2.3.8-2.9 .3-.6.2-1.1-.2-1.1-.3 0-1 1.2-1.6 2.6z" fill="var(--art-skin-deep,#CF9468)"/></svg>\n';
var S = 200 / 1254;
var disc = (x, y) => [Math.round(x * S * 10) / 10, Math.round(y * S * 10) / 10];
var BONES = {
  pelvis: { parent: null, at: disc(620, 730) },
  torso: { parent: "pelvis", at: disc(620, 662) },
  neck: { parent: "torso", at: disc(620, 430) },
  head: { parent: "neck", at: disc(620, 320) },
  upperL: { parent: "torso", at: disc(540, 500) },
  foreL: { parent: "upperL", at: disc(498, 605) },
  handL: { parent: "foreL", at: disc(440, 685) },
  upperR: { parent: "torso", at: disc(712, 505) },
  foreR: { parent: "upperR", at: disc(648, 625) },
  handR: { parent: "foreR", at: disc(588, 705) },
  thighL: { parent: "pelvis", at: disc(620, 730) },
  shinL: { parent: "thighL", at: disc(410, 768) },
  footL: { parent: "shinL", at: disc(430, 985) },
  thighR: { parent: "pelvis", at: disc(680, 740) },
  shinR: { parent: "thighR", at: disc(512, 775) },
  footR: { parent: "shinR", at: disc(525, 995) }
};
var NAMES = [
  "floor (scenery)",
  "shadow (scenery)",
  "chair: the back, its uprights, rails and back legs (scenery)",
  "chair: the back's shade (scenery)",
  "chair: seat (scenery)",
  "chair: seat's front (scenery)",
  "chair: seat's side (scenery)",
  "chair: front legs (scenery)",
  "chair: front legs' shade (scenery)",
  "shin L (its sock on it)",
  "shin L shade",
  "shin L: sock",
  "shin R (its sock on it)",
  "shin R shade",
  "shin R: sock",
  "foot L (shoe)",
  "foot R (shoe)",
  "thigh L (its knee showing)",
  "thigh R (its knee showing)",
  "thigh R shade",
  "pelvis (the skirt)",
  "pelvis shade",
  "neck",
  "neck shade",
  "torso (the dress's top)",
  "torso shade",
  "head",
  "head: hair",
  "head: hair shade",
  "head: ear (over the hair)",
  "head: nose and ear",
  "head: mouth",
  "head: eyes and brows",
  "upper arm R",
  "upper arm R shade",
  "upper arm R: its sleeve, over the arm's top",
  "upper arm R: sleeve shade",
  "forearm R",
  "forearm R shade",
  "hand R",
  "hand R shade",
  "upper arm L",
  "upper arm L shade",
  "upper arm L: its sleeve, over the arm's top",
  "upper arm L: sleeve shade",
  "forearm L",
  "forearm L shade",
  "hand L",
  "hand L shade"
];
var BONE_OF = (n) => {
  if (n.endsWith("(scenery)")) return null;
  if (n.startsWith("head")) return "head";
  if (n.startsWith("neck")) return "neck";
  if (n.startsWith("torso")) return "torso";
  if (n.startsWith("pelvis")) return "pelvis";
  const s = n.match(/ ([LR])\b/)[1];
  if (n.startsWith("upper arm")) return `upper${s}`;
  if (n.startsWith("forearm")) return `fore${s}`;
  if (n.startsWith("hand")) return `hand${s}`;
  if (n.startsWith("thigh")) return `thigh${s}`;
  if (n.startsWith("shin")) return `shin${s}`;
  return `foot${s}`;
};
var shapes = [...STILL.matchAll(/<(?:path|rect|ellipse)\b[^>]*\/>/g)].map((m) => m[0]);
if (shapes.length !== NAMES.length + 1) throw new Error(`sit.svg has ${shapes.length} shapes, not the background and ${NAMES.length} paths`);
var BACK = shapes[0];
var drawn = NAMES.map((name, i) => ({ name, bone: BONE_OF(name), text: shapes[i + 1] }));
var subsOf = (p) => p.text.match(/ d="([^"]+)"/)[1].split(/(?=M)/);
for (const n of ["foot L (shoe)", "foot R (shoe)"]) if (subsOf(drawn.find((p) => p.name === n)).length !== 1) throw new Error(`sit: ${n} isn't one shape: the still from before its correction`);
if (subsOf(drawn.find((p) => p.name === "pelvis (the skirt)")).length !== 2) throw new Error("sit: the skirt has its stray speck: the still from before its correction");
var PIECES = drawn;
var R = makeTformRig(BONES);

// sit/draw.mjs
import { parsePath, writePath, mapPath } from "./rig.js";
var SHOE = PIECES.find((p) => p.name === "foot L (shoe)");
var SOCK = PIECES.find((p) => p.name === "shin L: sock");
var SHOE_SUBS = parsePath(SHOE.text.match(/ d="([^"]+)"/)[1]);
var by = (M) => ([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
var shoeAt = (M) => `<path d="${writePath(SHOE_SUBS.map((s) => mapPath(s, by(M))))}" fill="${SHOE.text.match(/fill="([^"]+)"/)[1]}"/>`;
var SOCK_FOOT = (() => {
  const s = SHOE_SUBS[0], pts2 = [s.start, ...s.segs.flatMap((g) => g)], c = pts2.reduce((a, p) => [a[0] + p[0] / pts2.length, a[1] + p[1] / pts2.length], [0, 0]);
  const inset = (p) => {
    const d = [p[0] - c[0], p[1] - c[1]], L = Math.hypot(d[0], d[1]) || 1, k = Math.max(0, L - 0.6) / L;
    return [c[0] + d[0] * k, c[1] + d[1] * k];
  };
  return `<path d="${writePath([mapPath(s, inset)])}" fill="${SOCK.text.match(/fill="([^"]+)"/)[1]}"/>`;
})();
function frame(pose = {}) {
  const W = R.solve(pose), over = { ...pose.texts ?? {} }, off = pose.shoeL ?? null;
  const pieces = [];
  for (const p of PIECES) {
    if (p.name === "foot L (shoe)" && off) {
      pieces.push({ name: "foot L (sock)", bone: "footL", text: SOCK_FOOT }, { name: "shoe L, off", bone: null, text: shoeAt(off.M) });
      continue;
    }
    pieces.push(over[p.name] !== void 0 ? { ...p, text: over[p.name] } : p);
  }
  const shapes2 = `${BACK}${R.draw(pieces.filter((p) => p.text), W)}`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${shapes2}</svg>`, W };
}

// sit/face.mjs
import { parsePath as parse, writePath as write, mapPath as mapSub, smoothRing as smooth } from "./rig.js";
var pts = (s) => [s.start, ...s.segs.flatMap((g) => g)];
var centerOf = (s) => {
  const p = pts(s);
  return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
};
var marks = (name) => {
  const p = PIECES.find((q) => q.name === name);
  return { d: p.text.match(/ d="([^"]+)"/)[1], fill: p.text.match(/fill="([^"]+)"/)[1] };
};
var EB = marks("head: eyes and brows");
var MOUTH = marks("head: mouth");
var [browL, browR, eyeL, eyeR] = parse(EB.d);
var cL = centerOf(eyeL);
var cR = centerOf(eyeR);
var ax = Math.atan2(cR[1] - cL[1], cR[0] - cL[0]);
var U = [Math.cos(ax), Math.sin(ax)];
var V = [-Math.sin(ax), Math.cos(ax)];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1];
var shift = (s, k) => mapSub(s, ([x, y]) => [x + V[0] * k, y + V[1] * k]);
var eye = (s, down, h) => {
  const c = centerOf(s);
  return mapSub(s, (p) => {
    const d = [p[0] - c[0], p[1] - c[1]], a = dot(d, U), b = dot(d, V) * h + down;
    return [c[0] + a * U[0] + b * V[0], c[1] + a * U[1] + b * V[1]];
  });
};
var brow = (s, deg, up, side) => {
  const c = centerOf(s), r = side * deg * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
  return mapSub(s, ([x, y]) => [c[0] + (x - c[0]) * co - (y - c[1]) * si - V[0] * up, c[1] + (x - c[0]) * si + (y - c[1]) * co - V[1] * up]);
};
var N = 12;
function outlinePoints(sub, n) {
  const dense = [];
  let p0 = sub.start;
  for (const [a, b, e] of sub.segs) {
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, m = 1 - t;
      dense.push([m * m * m * p0[0] + 3 * m * m * t * a[0] + 3 * m * t * t * b[0] + t * t * t * e[0], m * m * m * p0[1] + 3 * m * m * t * a[1] + 3 * m * t * t * b[1] + t * t * t * e[1]]);
    }
    p0 = e;
  }
  let s = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i], b = dense[(i + 1) % dense.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  if (s < 0) dense.reverse();
  const first = dense.reduce((bi, q, i) => dot(q, U) < dot(dense[bi], U) ? i : bi, 0), ring = [...dense.slice(first), ...dense.slice(0, first)];
  const len = [0];
  for (let i = 1; i <= ring.length; i++) len.push(len[i - 1] + Math.hypot(ring[i % ring.length][0] - ring[i - 1][0], ring[i % ring.length][1] - ring[i - 1][1]));
  const out = [];
  for (let k = 0; k < n; k++) {
    const L = len.at(-1) * k / n;
    let j = 1;
    while (len[j] < L) j++;
    const t = (L - len[j - 1]) / (len[j] - len[j - 1] || 1), a = ring[j - 1], b = ring[j % ring.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
var SMILE_OPEN = outlinePoints(parse(MOUTH.d)[0], N);
var along = SMILE_OPEN.map((p) => dot(p, U));
var downs = SMILE_OPEN.map((p) => dot(p, V));
var TOP = (() => {
  const a = (Math.min(...along) + Math.max(...along)) / 2, b = Math.min(...downs);
  return [a * U[0] + b * V[0], a * U[1] + b * V[1]];
})();
var grin = (sx, sy) => SMILE_OPEN.map((p) => {
  const d = [p[0] - TOP[0], p[1] - TOP[1]], a = dot(d, U) * sx, b = dot(d, V) * sy;
  return [TOP[0] + a * U[0] + b * V[0], TOP[1] + a * U[1] + b * V[1]];
});
function closedMouth(w, arch, t, down) {
  const n = 12, half = w / 2, ring = [], mid = [TOP[0] + V[0] * down, TOP[1] + V[1] * down];
  const at = (a, b) => [mid[0] + a * U[0] + b * V[0], mid[1] + a * U[1] + b * V[1]];
  const line = (a) => arch * (2 * a / w) ** 2;
  for (let i = 0; i <= n; i++) {
    const a = -half + w * i / n;
    ring.push(at(a, -line(a) - t / 2 * Math.cos(Math.PI * a / w)));
  }
  for (let i = n; i >= 0; i--) {
    const a = -half + w * i / n;
    ring.push(at(a, -line(a) + t / 2 * Math.cos(Math.PI * a / w)));
  }
  return outlinePoints({ start: ring[0], segs: ring.slice(1).map((p, i) => [ring[i], p, p]) }, N);
}
var POUT = closedMouth(6, -1.5, 1.8, 2.2);
var mix = (a, b, k) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);
function face({ mouth = null, eyeDown = 0, eyeH = 1, browDeg = 0, browUp = 0, look = 0 } = {}) {
  const out = {};
  if (eyeDown || eyeH !== 1 || browDeg || browUp || look) {
    out["head: eyes and brows"] = `<path d="${write([brow(browL, browDeg, browUp, 1), brow(browR, browDeg, browUp, -1), eye(eyeL, eyeDown, eyeH), eye(eyeR, eyeDown, eyeH)].map((s) => shift(s, look)))}" fill="${EB.fill}"/>`;
  }
  if (mouth || look) out["head: mouth"] = `<path d="${write(smooth((mouth ?? SMILE_OPEN).map(([x, y]) => [x + V[0] * look, y + V[1] * look])))}" fill="${MOUTH.fill}"/>`;
  return out;
}

// sit/swing.mjs
import { track } from "./rig.js";
var G = 1784;
var SW = { A: 20, f: 1.45, lag: 0.07, from: 0.05 };
var swingAt = (t, to = null, lag = 0) => {
  const u = t - lag;
  if (u <= SW.from) return 0;
  const env = Math.min(1, (u - SW.from) / 0.35) * (to === null ? 1 : Math.max(0, Math.min(1, (to - u) / 0.3)));
  return SW.A * env * Math.sin(2 * Math.PI * SW.f * (u - SW.from));
};
var RELEASE = SW.from + 1.21 / SW.f;
var sadLegs = (t) => {
  const stop = track([[RELEASE, 0], [1.4, 1, "io"]], t);
  return { shinL: swingAt(t) * (1 - stop), shinR: swingAt(t, null, SW.lag) * (1 - stop) };
};
var SHOE_MID = [68.5, 165];
var ap = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
var footAt = (t) => R.solve({ rot: sadLegs(t) }).footL;
var F0 = footAt(RELEASE);
var F1 = footAt(RELEASE - 1e-3);
var C0 = ap(F0.M, SHOE_MID);
var TH0 = F0.th;
var V0 = [(C0[0] - ap(F1.M, SHOE_MID)[0]) / 1e-3, (C0[1] - ap(F1.M, SHOE_MID)[1]) / 1e-3];
var FLOOR_MID = 185;
var LAND_TH = 45;
var T_FALL = (-V0[1] + Math.sqrt(V0[1] * V0[1] + 2 * G * (FLOOR_MID - C0[1]))) / G;
var LAND = RELEASE + T_FALL;
var LANDED = { c: [C0[0] + V0[0] * T_FALL, FLOOR_MID], th: LAND_TH };

// sit/poses.mjs
var rad = Math.PI / 180;
var placeShoe = (c, th) => {
  const co = Math.cos(th * rad), si = Math.sin(th * rad);
  return [co, si, -si, co, c[0] - (co * SHOE_MID[0] - si * SHOE_MID[1]), c[1] - (si * SHOE_MID[0] + co * SHOE_MID[1])];
};
var ENDS = {
  // she swings her legs, then kicks them both out straight in front of her (her knees straightening, her toes up), grinning
  happy: () => ({
    rot: { shinL: 58, footL: -24, shinR: 54, footR: -22, head: -2 },
    texts: face({ mouth: grin(1.25, 1.35), browUp: 0.9, eyeH: 0.8 })
  }),
  // a swing sends her left shoe off her foot; it lies on the floor below, out of reach (her feet don't reach the floor): she looks down at it, her
  // head bowed toward it, her brows up at their inner ends, a pout; her foot in its sock hanging
  sad: () => ({
    rot: { neck: -3, head: -7 },
    // (where its flight puts it, on its sole: swing.mjs)
    shoeL: { M: placeShoe(LANDED.c, LANDED.th) },
    texts: face({ mouth: POUT, eyeDown: 1.1, browDeg: 16, browUp: 0.7, look: 1.4 })
  })
};

// sit/story.mjs
import { track as track2 } from "./rig.js";
var swingAt2 = (t, from, to, lag = 0) => swingAt(t, to, lag);
var E_H = ENDS.happy();
var H = {
  dur: 2.4,
  swingTo: 1.05,
  // the swings fading into the kick
  kick: [[0.9, 0], [1.25, 1.12, "out"], [1.55, 1, "io"]],
  // her legs out straight, a little over and back
  grin: [[0.95, 0], [1.35, 1, "out"]],
  holdFrom: 1.5
};
function happyPose(t) {
  const D = H.dur, k = track2(H.kick, t), g = track2(H.grin, t);
  const ht = t - H.holdFrom, env = ht <= 0 ? 0 : Math.min(1, ht / 0.2) * Math.max(0, 1 - ht / (D - H.holdFrom)) ** 2, tremble = env * Math.sin(2 * Math.PI * 3.1 * Math.max(0, ht));
  const sL = swingAt2(t, 0.05, H.swingTo) * (1 - k), sR = swingAt2(t, 0.05, H.swingTo, SW.lag) * (1 - k);
  const rot = { shinL: sL + E_H.rot.shinL * k + 2.2 * tremble, footL: E_H.rot.footL * k, shinR: sR + E_H.rot.shinR * k + 1.8 * tremble, footR: E_H.rot.footR * k, head: E_H.rot.head * k + 0.6 * Math.sin(2 * Math.PI * SW.f * t) * Math.max(0, 1 - t / 1.1) };
  return { rot, texts: face({ mouth: mix(SMILE_OPEN, grin(1.25, 1.35), g), browUp: 0.9 * g, eyeH: 1 - 0.2 * g }) };
}
var E_S = ENDS.sad();
var S2 = { dur: 2.6, release: RELEASE };
function shoeAt2(t) {
  if (t < RELEASE) return null;
  if (t < LAND) {
    const dt2 = t - RELEASE, k = dt2 / T_FALL;
    return { M: placeShoe([C0[0] + V0[0] * dt2, C0[1] + V0[1] * dt2 + 0.5 * G * dt2 * dt2], TH0 + (LANDED.th - TH0) * k) };
  }
  const dt = t - LAND, rock = dt < 0.3 ? 9 * Math.exp(-dt * 12) * Math.sin(dt * Math.PI * 2 * 4) : 0;
  return { M: placeShoe(LANDED.c, LANDED.th + rock) };
}
function sadPose(t) {
  const D = S2.dur;
  const look = track2([[S2.release + 0.15, 0], [S2.release + 0.55, 1, "io"]], t), pout = track2([[S2.release + 0.1, 0], [S2.release + 0.6, 1, "io"]], t);
  const at = t - 1.5, env = at <= 0 ? 0 : Math.min(1, at / 0.25) * Math.max(0, 1 - at / (D - 1.5)) ** 2, dangle = env * Math.sin(2 * Math.PI * 1.6 * Math.max(0, at));
  const rot = { ...sadLegs(t), neck: E_S.rot.neck * look, head: E_S.rot.head * look };
  rot.shinL += 4 * dangle;
  const pose = { rot, texts: face({ mouth: mix(SMILE_OPEN, POUT, pout), eyeDown: 1.1 * look, browDeg: 16 * look, browUp: 0.7 * look, look: 1.4 * look }) };
  const shoe = shoeAt2(t);
  return shoe ? { ...pose, shoeL: shoe } : pose;
}
var MOODS = { happy: { dur: H.dur, pose: happyPose }, sad: { dur: S2.dur, pose: sadPose } };
var REACTIONS = Object.fromEntries(Object.entries(MOODS).map(([m, M]) => [m, { dur: M.dur }]));
function poseAt(m, t) {
  const M = MOODS[m];
  return M.pose(Math.min(Math.max(t, 0), M.dur));
}
function frame2(m, t) {
  t = Math.min(Math.max(t, 0), MOODS[m].dur);
  if (t === 0) return STILL;
  return frame(poseAt(m, t)).svg;
}
export {
  REACTIONS,
  STILL,
  frame2 as frame
};
export const STILL_HASH = "a25c0ce3a6";
