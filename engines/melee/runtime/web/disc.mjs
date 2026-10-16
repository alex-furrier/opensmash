export const ISO_SHA256 = '0de05981a34156b9cedcef73c73d4244ac05cf6149ab3c9cfed917698819e464';
export const DOL_SHA256 = 'dc21504513424350bda17a7c65e82371b45112a5dfc1e9f2749a8b7ab0eff646';
export const ISO_SIZE = 1459978240;

// Keep diagnostics to known stages and byte counts, never file names or URLs.
export function discSizeError(stage, expectedBytes, actualBytes) {
  return Object.assign(Error(`This image has an unexpected size (${stage}; expected ${expectedBytes} bytes, actual ${actualBytes} bytes).`), {discStage:stage, expectedBytes, actualBytes});
}
export function discStorageError(cause, stage, expectedBytes, actualBytes) {
  const reasons = {UnknownError:'The browser could not finish preparing the game', NotReadableError:'The browser could not read game storage', QuotaExceededError:'The browser does not have enough storage for the game', InvalidStateError:'Game storage became unavailable', NotAllowedError:'The browser did not allow access to game storage', SecurityError:'The browser blocked access to game storage'};
  if (!Object.hasOwn(reasons, cause?.name)) return cause;
  const bytes = `expected ${expectedBytes} bytes${actualBytes === undefined ? '' : `, actual ${actualBytes} bytes`}`;
  return Object.assign(Error(`${reasons[cause.name]} (${cause.name}; ${stage}; ${bytes}). Your saved game has not been cleared.`, {cause}), {name:cause.name, discStage:stage, expectedBytes, ...(actualBytes === undefined ? {} : {actualBytes})});
}

/** Copy only safe diagnostics, including the existing iframe's string error format. */
export function discFailureDetails(error) {
  const names=['UnknownError','QuotaExceededError','NotReadableError','NotAllowedError','SecurityError','InvalidStateError','AbortError'];
  const result={name:names.includes(error?.name)?error.name:'Error'};
  const counts=['expectedBytes','actualBytes','receivedBytes','writtenBytes','readOffset','expectedReadBytes','actualReadBytes'];
  const count=(key,value)=>{if(Number.isSafeInteger(value)&&value>=0)result[key]=value;};
  if(/^[a-z-]+(?:@\d+)?$/.test(error?.discStage||''))result.discStage=error.discStage;
  for(const key of counts)count(key,error?.[key]);
  if(!result.discStage){
    const match=/\((?:(UnknownError|QuotaExceededError|NotReadableError|NotAllowedError|SecurityError|InvalidStateError); )?((?:verification-(?:file|read|digest)(?:@\d+)?|disc-inspection)); expected (\d+) bytes(?:, actual (\d+) bytes)?(?:; readOffset (\d+), expectedReadBytes (\d+), actualReadBytes (\d+))?\)/.exec(error?.message||'');
    if(match){
      if(match[1])result.name=match[1];
      result.discStage=match[2];
      for(const [key,index] of [['expectedBytes',3],['actualBytes',4],['readOffset',5],['expectedReadBytes',6],['actualReadBytes',7]])if(match[index]!==undefined)count(key,Number(match[index]));
    }
  }
  return result;
}

export async function inspectDisc(file) {
  if (file.size !== ISO_SIZE) throw discSizeError('disc-inspection', ISO_SIZE, file.size);
  const read = async (offset, length) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > file.size)
      throw Error('Invalid disc file range.');
    return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  };
  const header = await read(0, 0x2460);
  const view = new DataView(header.buffer);
  if (new TextDecoder().decode(header.subarray(0, 6)) !== 'GALE01' || header[7] !== 2 || view.getUint32(0x1c) !== 0xc2339f3d)
    throw Error('This port requires Melee USA 1.02 (GALE01, revision 2).');
  const dolOffset = view.getUint32(0x420);
  const dolHeader = new DataView((await read(dolOffset, 0x100)).buffer);
  let dolSize = 0x100;
  for (let i = 0; i < 18; i++) {
    const size = dolHeader.getUint32(0x90 + i * 4);
    if (size) dolSize = Math.max(dolSize, dolHeader.getUint32(i * 4) + size);
  }
  const dol = await read(dolOffset, dolSize);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', dol)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== DOL_SHA256) throw Error('The game executable does not match the known USA 1.02 hash.');
  const blobs = [];
  function add(name, offset, size) {
    if (offset < 0 || size < 0 || offset + size > file.size) throw Error('Invalid disc file range.');
    blobs.push({name, data: file.slice(offset, offset + size)});
  }
  add('sys/boot.bin', 0, 0x440);
  add('sys/bi2.bin', 0x440, 0x2000);
  add('sys/apploader.img', 0x2440, 0x20 + view.getUint32(0x2454) + view.getUint32(0x2458));
  add('sys/main.dol', dolOffset, dolSize);
  const fstOffset = view.getUint32(0x424), fstSize = view.getUint32(0x428);
  if (fstSize < 12 || fstSize > 16 * 1024 * 1024) throw Error('Invalid disc file table.');
  const fst = await read(fstOffset, fstSize), table = new DataView(fst.buffer);
  const count = table.getUint32(8);
  if (fst[0] !== 1 || !count || count * 12 > fst.length) throw Error('Invalid disc root.');
  add('sys/fst.bin', fstOffset, fstSize);
  const stack = [{end: count, path: 'files', index: 0}];
  const names = new Set();
  for (let i = 1; i < count; i++) {
    while (i >= stack.at(-1).end) stack.pop();
    const parent = stack.at(-1), typeName = table.getUint32(i * 12);
    const nameOffset = count * 12 + (typeName & 0xffffff);
    const endName = fst.indexOf(0, nameOffset);
    if (nameOffset >= fst.length || endName < nameOffset) throw Error('Invalid disc filename.');
    const name = new TextDecoder('utf-8', {fatal: true}).decode(fst.subarray(nameOffset, endName));
    if (!name || name === '.' || name === '..' || /[/\\\x00-\x1f]/.test(name)) throw Error('Unsafe disc filename.');
    const path = `${parent.path}/${name}`;
    if (names.has(path)) throw Error('Duplicate disc filename.');
    names.add(path);
    const offset = table.getUint32(i * 12 + 4), size = table.getUint32(i * 12 + 8);
    if (typeName >>> 24 === 1) {
      if (offset !== parent.index || size <= i || size > parent.end) throw Error('Invalid disc directory.');
      stack.push({end: size, path, index: i});
    } else if (typeName >>> 24 === 0) add(path, offset, size);
    else throw Error('Invalid disc entry type.');
  }
  return {blobs, executableHash: hash};
}
