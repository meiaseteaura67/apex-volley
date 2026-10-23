// Compatibility entry point: every bot now uses the ordinary simulation input path.
export function isDuelBot(){return false;}
export function duelCpu(m,p){p.input=m.tactics.decide({time:m.time,phaseTime:m.phaseTime,phase:m.phase,ball:m.ball,players:m.players,touches:m.touches,server:m.server.id},p);}
