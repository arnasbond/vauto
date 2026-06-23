export const VISION_EXTRACTION_INSTRUCTIONS = `Atpažink tiksliai pagrindinį objektą nuotraukoje (telefonas, kompiuteris, planšetė, baldai, drabužis, avalynė, automobilis, auto dalis, nekilnojamas turtas ir kt.).
category ir title privalo atitikti tai, ką realiai matai — neįvardink kito daikto (pvz. nekurk ratlankių jei matai telefoną).
Jei tai mobilus telefonas ar elektronika — category "electronics".
Jei auto dalis (ratlankis, padanga) — category "vehicles" su partType, size, condition, quantity.
Kainą pateik realistišką EUR pagal Lietuvos rinką.`;
