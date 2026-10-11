export type SecQueueOutcome="succeeded"|"partial"|"failed"|"retryable";

/** Only temporary transport/provider disruptions get an automatic retry. */
export function retryableSecError(reason:string):boolean {
  return /\b(?:429|50[0-9]|52[0-9])\b|timeout|timed out|fetch failed|network/i.test(reason);
}
export function shouldTreatSecAsComplete(input:{
  originalThreeYears:boolean|null;
  structuralFlags:readonly (number|null)[];
}):boolean{
  return input.originalThreeYears===true &&
    input.structuralFlags.length===4 &&
    input.structuralFlags.every(n=>n===0);
}
