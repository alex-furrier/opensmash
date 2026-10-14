// Catalog entries describe fighters; active imports own installed browser sources.
export function resolvedLaunchRoster(catalog, imports, active, sourceOnly) {
 const current=new Set(active.map(row=>row.slug));
 const rows=new Map(catalog.map(row=>[row.slug,sourceOnly?{...row,randomReady:false}:row]));
 for(const row of imports)rows.set(row.slug,sourceOnly?{...row,randomReady:current.has(row.slug)}:row);
 for(const row of active)rows.set(row.slug,sourceOnly?{...row,randomReady:true}:row);
 return [...rows.values()];
}
