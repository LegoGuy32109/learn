// @ts-check
import { shuffled } from "../../shared/learning/shuffle.js";
/** @param {any} lesson */
export function initialFlow(lesson) { return { screen:"card", conceptIndex:0, cardIndex:0, flowKind:"cards", history:[], seed:0, attemptId:"", queue:[], feedback:null, detour:null }; }
/** @param {any} lesson @param {any} flow */
export function current(lesson, flow) { const concept=lesson.concepts[flow.conceptIndex]; if (flow.screen === "card" || flow.screen === "corrective") return concept.cards[flow.cardIndex]; return lesson.questions.find((q)=>q.id===flow.queue[0]); }
/** @param {any} lesson @param {any} flow */
export function startCheck(lesson, flow) { const c=lesson.concepts[flow.conceptIndex], q=lesson.questions.filter(x=>x.conceptId===c.id); const seed=Math.floor(Math.random()*2**31); return {...flow,screen:"question",flowKind:"check",seed,attemptId:crypto.randomUUID(),queue:shuffled(q.map(x=>x.id),seed),feedback:null}; }
/** @param {any} lesson @param {any} flow */
export function startWrapUp(lesson, flow) { const seed=Math.floor(Math.random()*2**31); const queue=lesson.concepts.map((c,i)=>shuffled(lesson.questions.filter(q=>q.conceptId===c.id).map(q=>q.id),seed+i)[0]); return {...flow,screen:"question",flowKind:"wrap_up",seed,attemptId:crypto.randomUUID(),queue,feedback:null}; }
