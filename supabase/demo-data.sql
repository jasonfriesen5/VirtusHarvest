-- ═══════════════════════════════════════════════════════════════════
--  Virtus Feed — demo data
--  60 days of a real-shaped feedlot so the app has something to show.
--
--  Set the target account on the first line, then run the whole file.
--  Re-running is safe: it deletes this user's vf_* rows first.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  -- Target account. Change this to seed a different user.
  v_email  text := 'aufpfostensteh@gmail.com';
  v_user   uuid := (select id from auth.users where email = v_email);

  v_cycle  text := 'demo-cycle';
  v_ration text := 'demo-ration-2';
  v_ration1 text := 'demo-ration-1';

  -- ingredient ids
  i_sil text := 'demo-ing-silage';
  i_cor text := 'demo-ing-corn';
  i_soy text := 'demo-ing-soy';
  i_min text := 'demo-ing-mineral';
  i_hay text := 'demo-ing-hay';

  v_lot   record;
  d       int;
  meal    text;
  fid     text;
  did     text;
  ts      timestamptz;

  head        int;
  target_tot  numeric;
  loaded_tot  numeric;
  delivered   numeric;
  dm_frac     numeric := 0.441;   -- weighted DM of the fase-2 mix
  jitter      numeric;
begin
  if v_user is null then
    raise exception 'No user %% — create the account in the app first.', v_email;
  end if;

  -- Clean slate for this user
  delete from vf_feed_deliveries where user_id = v_user;
  delete from vf_feed_loads      where user_id = v_user;
  delete from vf_feedings        where user_id = v_user;
  delete from vf_bunk_scores     where user_id = v_user;
  delete from vf_weigh_ins       where user_id = v_user;
  delete from vf_ration_items    where user_id = v_user;
  delete from vf_rations         where user_id = v_user;
  delete from vf_lots            where user_id = v_user;
  delete from vf_ingredients     where user_id = v_user;
  delete from vf_mixers          where user_id = v_user;
  delete from vf_operators       where user_id = v_user;
  delete from vf_cycles          where user_id = v_user;

  -- ── Cycle ──
  insert into vf_cycles(id,user_id,name,start_date,active)
  values (v_cycle, v_user, to_char(now(),'YYYY'), (now()-interval '60 days')::date, true);

  -- ── Ingredients. tol_pct tightens as the ingredient gets more potent. ──
  insert into vf_ingredients(id,user_id,name,category,dm_pct,cost_per_kg,currency,stock_kg,tol_pct,active) values
    (i_sil,v_user,'Silaje de maíz','forraje',     32, 280,'PYG', 48000,120,true),
    (i_cor,v_user,'Maíz molido',   'concentrado', 87,1450,'PYG',  9200,112,true),
    (i_soy,v_user,'Expeller soja', 'concentrado', 89,2600,'PYG',  3400,110,true),
    (i_min,v_user,'Núcleo mineral','mineral',     98,5200,'PYG',   260,105,true),
    (i_hay,v_user,'Heno de alfalfa','forraje',    88,1100,'PYG',  1800,118,true);

  -- ── Rations ──
  insert into vf_rations(id,user_id,name,version,notes,active) values
    (v_ration1,v_user,'Engorde fase 1',1,'Adaptación — más fibra',false),
    (v_ration, v_user,'Engorde fase 2',1,'Terminación',true);

  insert into vf_ration_items(id,user_id,ration_id,ingredient_id,kg_per_head,seq) values
    ('demo-ri-1a',v_user,v_ration1,i_sil,20.0,0),
    ('demo-ri-1b',v_user,v_ration1,i_hay, 1.5,1),
    ('demo-ri-1c',v_user,v_ration1,i_cor, 2.5,2),
    ('demo-ri-1d',v_user,v_ration1,i_min, 0.12,3),
    ('demo-ri-2a',v_user,v_ration, i_sil,18.0,0),
    ('demo-ri-2b',v_user,v_ration, i_cor, 4.2,1),
    ('demo-ri-2c',v_user,v_ration, i_soy, 1.6,2),
    ('demo-ri-2d',v_user,v_ration, i_min, 0.15,3);

  -- ── Lots ──
  insert into vf_lots(id,user_id,cycle_id,name,pen_code,head_count,category,entry_date,
                      entry_weight_kg,avg_weight_kg,target_weight_kg,ration_id,meals_per_day,route_order,active) values
    ('demo-lot-1',v_user,v_cycle,'Corral 1','C1',117,'novillo', (now()-interval '60 days')::date,338,420,520,v_ration,2,1,true),
    ('demo-lot-2',v_user,v_cycle,'Corral 2','C2', 96,'novillo', (now()-interval '58 days')::date,352,431,520,v_ration,2,2,true),
    ('demo-lot-4',v_user,v_cycle,'Corral 4','C4',140,'vaquilla',(now()-interval '55 days')::date,301,368,440,v_ration,2,3,true),
    ('demo-lot-5',v_user,v_cycle,'Corral 5','C5', 88,'novillo', (now()-interval '12 days')::date,295,318,510,v_ration1,2,4,true);

  insert into vf_mixers(id,user_id,name,capacity_kg,serial)
  values ('demo-mixer-1',v_user,'Mixer 1',12000,'VS-0417');

  insert into vf_operators(id,user_id,name,role,active) values
    ('demo-op-1',v_user,'Ramón Villalba','Mixero',true),
    ('demo-op-2',v_user,'Derlis Acosta','Mixero',true);

  -- ── Weigh-ins: entry and current ──
  insert into vf_weigh_ins(id,user_id,cycle_id,lot_id,lot_name,avg_weight_kg,head_count,at) values
    ('demo-wi-1a',v_user,v_cycle,'demo-lot-1','Corral 1',338,120,now()-interval '60 days'),
    ('demo-wi-1b',v_user,v_cycle,'demo-lot-1','Corral 1',420,117,now()-interval '1 day'),
    ('demo-wi-2a',v_user,v_cycle,'demo-lot-2','Corral 2',352, 96,now()-interval '58 days'),
    ('demo-wi-2b',v_user,v_cycle,'demo-lot-2','Corral 2',431, 96,now()-interval '1 day'),
    ('demo-wi-4a',v_user,v_cycle,'demo-lot-4','Corral 4',301,142,now()-interval '55 days'),
    ('demo-wi-4b',v_user,v_cycle,'demo-lot-4','Corral 4',368,140,now()-interval '1 day');

  -- ── 60 days × 2 feedings ──
  for d in reverse 59..0 loop
    foreach meal in array array['AM','PM'] loop
      ts  := date_trunc('day', now()) - (d || ' days')::interval
             + (case when meal='AM' then interval '6 hours' else interval '16 hours' end);
      fid := 'demo-f-' || d || '-' || meal;

      -- Head fed this round (Corral 5 only joined 12 days ago)
      select coalesce(sum(head_count),0) into head
      from vf_lots where user_id=v_user and ration_id=v_ration;

      target_tot := head * (18.0+4.2+1.6+0.15) / 2;   -- half the daily ration per meal
      jitter     := 1 + ((random()-0.5) * 0.05)::numeric;       -- operator lands within ±2.5%
      loaded_tot := round(target_tot * jitter);

      insert into vf_feedings(id,user_id,cycle_id,mixer_id,mixer_name,ration_id,ration_name,
                              operator_name,meal,status,started_at,finished_at,
                              total_loaded_kg,total_delivered_kg)
      values (fid,v_user,v_cycle,'demo-mixer-1','Mixer 1',v_ration,'Engorde fase 2',
              case when d % 2 = 0 then 'Ramón Villalba' else 'Derlis Acosta' end,
              meal,'done',ts,ts+interval '52 minutes',loaded_tot,loaded_tot);

      -- Loads, one row per ingredient
      insert into vf_feed_loads(id,user_id,feeding_id,ingredient_id,ingredient_name,target_kg,actual_kg,seq,at) values
        (fid||'-l0',v_user,fid,i_sil,'Silaje de maíz',round(head*18.0/2), round(head*18.0/2*(1+(random()-0.4)*0.06)::numeric),0,ts+interval '4 minutes'),
        (fid||'-l1',v_user,fid,i_cor,'Maíz molido',   round(head* 4.2/2), round(head* 4.2/2*(1+(random()-0.5)*0.05)::numeric),1,ts+interval '11 minutes'),
        (fid||'-l2',v_user,fid,i_soy,'Expeller soja', round(head* 1.6/2), round(head* 1.6/2*(1+(random()-0.5)*0.04)::numeric),2,ts+interval '17 minutes'),
        (fid||'-l3',v_user,fid,i_min,'Núcleo mineral',round(head*0.15/2,1),round(head*0.15/2*(1+(random()-0.5)*0.03)::numeric,1),3,ts+interval '22 minutes');

      -- Deliveries, split by head count
      for v_lot in select * from vf_lots where user_id=v_user and ration_id=v_ration order by route_order loop
        did       := fid || '-d' || v_lot.route_order;
        delivered := round(loaded_tot * (v_lot.head_count::numeric / head));
        insert into vf_feed_deliveries(id,user_id,feeding_id,lot_id,lot_name,head_count,
                                       target_kg,actual_kg,kg_per_head,dm_kg_per_head,seq,at)
        values (did,v_user,fid,v_lot.id,v_lot.name,v_lot.head_count,
                round(target_tot*(v_lot.head_count::numeric/head)), delivered,
                round(delivered/v_lot.head_count,2),
                round(delivered/v_lot.head_count*dm_frac,2),
                v_lot.route_order, ts+interval '30 minutes');
      end loop;
    end loop;

    -- Bunk score every third morning
    if d % 3 = 0 then
      for v_lot in select * from vf_lots where user_id=v_user and ration_id=v_ration loop
        insert into vf_bunk_scores(id,user_id,lot_id,score,operator_name,at)
        values ('demo-b-'||d||'-'||v_lot.route_order, v_user, v_lot.id,
                (array[0,1,1,1,2,2,3])[1+floor(random()*7)], 'Ramón Villalba',
                date_trunc('day', now()) - (d||' days')::interval + interval '5 hours');
      end loop;
    end if;
  end loop;

  -- ── Corral 5: 12 days on the adaptation diet ──
  -- A feedlot runs two mixes whenever a new pen is still stepping up, so the
  -- demo has to show that case, not just one uniform ration.
  for d in reverse 11..0 loop
    foreach meal in array array['AM','PM'] loop
      ts  := date_trunc('day', now()) - (d||' days')::interval
             + (case when meal='AM' then interval '7 hours' else interval '17 hours' end);
      fid := 'demo-f1-'||d||'-'||meal;
      head := 88;

      target_tot := head * (20.0+1.5+2.5+0.12) / 2;
      loaded_tot := round(target_tot * (1+((random()-0.5)*0.05))::numeric);

      insert into vf_feedings(id,user_id,cycle_id,mixer_id,mixer_name,ration_id,ration_name,
                              operator_name,meal,status,started_at,finished_at,
                              total_loaded_kg,total_delivered_kg)
      values (fid,v_user,v_cycle,'demo-mixer-1','Mixer 1',v_ration1,'Engorde fase 1',
              'Derlis Acosta',meal,'done',ts,ts+interval '34 minutes',loaded_tot,loaded_tot);

      insert into vf_feed_loads(id,user_id,feeding_id,ingredient_id,ingredient_name,target_kg,actual_kg,seq,at) values
        (fid||'-l0',v_user,fid,i_sil,'Silaje de maíz', round(head*20.0/2), round(head*20.0/2*(1+(random()-0.4)*0.06)::numeric),0,ts+interval '4 minutes'),
        (fid||'-l1',v_user,fid,i_hay,'Heno de alfalfa',round(head* 1.5/2), round(head* 1.5/2*(1+(random()-0.5)*0.06)::numeric),1,ts+interval '9 minutes'),
        (fid||'-l2',v_user,fid,i_cor,'Maíz molido',    round(head* 2.5/2), round(head* 2.5/2*(1+(random()-0.5)*0.05)::numeric),2,ts+interval '15 minutes'),
        (fid||'-l3',v_user,fid,i_min,'Núcleo mineral', round(head*0.12/2,1),round(head*0.12/2*(1+(random()-0.5)*0.03)::numeric,1),3,ts+interval '20 minutes');

      -- fase 1 is wetter than fase 2: more silage, less grain
      insert into vf_feed_deliveries(id,user_id,feeding_id,lot_id,lot_name,head_count,
                                     target_kg,actual_kg,kg_per_head,dm_kg_per_head,seq,at)
      values (fid||'-d0',v_user,fid,'demo-lot-5','Corral 5',head,
              round(target_tot), loaded_tot,
              round(loaded_tot/head,2), round(loaded_tot/head*0.404,2), 0, ts+interval '26 minutes');
    end loop;
  end loop;

  insert into vf_weigh_ins(id,user_id,cycle_id,lot_id,lot_name,avg_weight_kg,head_count,at) values
    ('demo-wi-5a',v_user,v_cycle,'demo-lot-5','Corral 5',295,88,now()-interval '12 days'),
    ('demo-wi-5b',v_user,v_cycle,'demo-lot-5','Corral 5',307,88,now()-interval '1 day');

  raise notice 'Demo data loaded for user %', v_user;
end $$;