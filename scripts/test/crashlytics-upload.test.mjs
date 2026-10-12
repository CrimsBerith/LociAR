import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const script=fileURLToPath(new URL('../upload-crashlytics-symbols.sh',import.meta.url));
function fixture(t,body){
  const root=mkdtempSync(join(tmpdir(),'lociar symbols '));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const uploader=join(root,'SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols');
  mkdirSync(join(uploader,'..'),{recursive:true});
  writeFileSync(uploader,'#!/bin/sh\n'+body+'\n',{mode:0o700});
  return {root,env:{...process.env,CONFIGURATION:'Release',BUILD_DIR:join(root,'Build/Products'),
    LOCIAR_FIREBASE_GOOGLE_APP_ID:'synthetic-app-id',DWARF_DSYM_FOLDER_PATH:root,DWARF_DSYM_FILE_NAME:'LociAR.app.dSYM',
    LOCIAR_CRASHLYTICS_UPLOAD_TIMEOUT_SECONDS:'1'}};
}
function run(env){
  const result=spawnSync('/bin/sh',[script],{env,encoding:'utf8',timeout:8000});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  return result;
}
test('non-Release builds do not start the symbol uploader',t=>{
  const {env}=fixture(t,'exit 42');
  assert.equal(run({...env,CONFIGURATION:'Debug'}).stdout,'');
});
test('successful upload preserves app id and dSYM path with spaces',t=>{
  const {root,env}=fixture(t,'printf "%s\\n" "$@" > "$DWARF_DSYM_FOLDER_PATH/args.txt"');
  const result=run(env);
  assert.equal(result.stdout,'');
  assert.deepEqual(readFileSync(join(root,'args.txt'),'utf8').trim().split('\n'),['-ai','synthetic-app-id','-p','ios',join(root,'LociAR.app.dSYM')]);
});
test('failed upload warns without discarding the archive',t=>{
  const {env}=fixture(t,'exit 7');
  assert.match(run(env).stdout,/dSYM upload failed/);
});
test('stalled uploader is stopped within the deadline and termination grace',t=>{
  const {env}=fixture(t,'exec sleep 30');
  const started=Date.now();
  assert.match(run(env).stdout,/timed out after 1s/);
  assert.ok(Date.now()-started<7500,'One-second deadline and five-second termination grace must remain bounded');
});
