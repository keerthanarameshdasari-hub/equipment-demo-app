-- equipDemo: non-sensitive demo data. Adds rows only if the table is empty.
insert into public.equipment (name, price_per_hour)
select * from (values
  ('JCB Backhoe Loader', 1500.00),
  ('Mini Excavator',     2000.00),
  ('Concrete Mixer',      650.00),
  ('Scissor Lift',        900.00),
  ('Road Roller',        1800.00)
) as demo(name, price_per_hour)
where not exists (select 1 from public.equipment);
