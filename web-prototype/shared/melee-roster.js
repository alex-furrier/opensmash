/** Website presentation only; imported source names/shorts remain unchanged. */
export function meleeRosterPresentation(row){
 const alias=row.displayName&&row.displayName!==row.name;
 return {...row,sourceName:row.name,sourceShort:row.short,name:row.displayName||row.name,short:alias?row.displayName:row.short,visibility:'private',
  portrait:row.portrait&&'/melee'+row.portrait,portraitTile:row.portraitTile&&'/melee'+row.portraitTile,portraitMedium:row.portraitMedium&&'/melee'+row.portraitMedium};
}
