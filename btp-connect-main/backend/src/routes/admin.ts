import type { FastifyInstance } from "fastify";
import { requireRole } from "../guards/role.js";
import { prisma } from "../lib/prisma.js";
import { toCsvBomSemicolon } from "../lib/csv.js";
import { parseCsv } from "../lib/csv_parse.js";

export async function adminRoutes(app: FastifyInstance) {
  // Export Sous-Traitants CSV
  app.get("/admin/export/st.csv", { preHandler: [app.authenticate, requireRole(["ADMIN"])] }, async (req, reply) => {
    const entrepriseId = req.user.entrepriseId;
    const items = await prisma.sousTraitant.findMany({ where: { entrepriseId }, orderBy: { updatedAt: "desc" } });

    const headers = ["id", "nom", "siret", "metier", "email", "tel", "ville", "note", "createdAt", "updatedAt"];
    const rows = items.map(i => [i.id, i.nom, i.siret, i.metier, i.email, i.tel, i.ville, i.note ?? "", i.createdAt.toISOString(), i.updatedAt.toISOString()]);
    const csv = toCsvBomSemicolon(headers, rows);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=sous-traitants.csv");
    return reply.send(csv);
  });

  // Export Chantiers CSV
  app.get("/admin/export/chantiers.csv", { preHandler: [app.authenticate, requireRole(["ADMIN"])] }, async (req, reply) => {
    const entrepriseId = req.user.entrepriseId;
    const items = await prisma.chantier.findMany({ where: { entrepriseId }, orderBy: { updatedAt: "desc" } });

    const headers = ["id", "nom", "client", "adresse", "montantMarche", "statut", "createdAt", "updatedAt"];
    const rows = items.map(i => [i.id, i.nom, i.client, i.adresse, i.montantMarche?.toString() ?? "", i.statut ?? "", i.createdAt.toISOString(), i.updatedAt.toISOString()]);
    const csv = toCsvBomSemicolon(headers, rows);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=chantiers.csv");
    return reply.send(csv);
  });

  // Import Sous-Traitants CSV (expects columns: nom,siret,metier,email,tel,ville,note)
  app.post("/admin/import/st", { preHandler: [app.authenticate, requireRole(["ADMIN"])] }, async (req, reply) => {
    const mp = await req.file();
    if (!mp) return reply.status(400).send({ error: "Missing file (multipart/form-data field name: file)" });

    const buf = await mp.toBuffer();
    const text = buf.toString("utf-8");
    const rows = parseCsv(text);
    if (rows.length < 2) return reply.status(400).send({ error: "CSV vide" });

    const headers = rows[0].map(h => h.toLowerCase());
    const idx = (name: string) => headers.indexOf(name);

    const entrepriseId = req.user.entrepriseId;
    let created = 0;

    for (const r of rows.slice(1)) {
      const nom = r[idx("nom")] || r[idx("name")] || "";
      if (!nom) continue;

      const siret = (idx("siret") >= 0 ? r[idx("siret")] : undefined) || undefined;
      const metier = (idx("metier") >= 0 ? r[idx("metier")] : undefined) || undefined;
      const email = (idx("email") >= 0 ? r[idx("email")] : undefined) || undefined;
      const tel = (idx("tel") >= 0 ? r[idx("tel")] : undefined) || undefined;
      const ville = (idx("ville") >= 0 ? r[idx("ville")] : undefined) || undefined;
      const noteRaw = (idx("note") >= 0 ? r[idx("note")] : "") || "";
      const note = noteRaw ? Number(noteRaw.replace(",", ".")) : undefined;

      await prisma.sousTraitant.create({
        data: { entrepriseId, nom, siret, metier, email, tel, ville, note: Number.isFinite(note) ? note : undefined }
      });
      created++;
    }

    return { ok: true, created };
  });

  // Import Chantiers CSV (expects columns: nom,client,adresse,montant,statut)
  app.post("/admin/import/chantiers", { preHandler: [app.authenticate, requireRole(["ADMIN"])] }, async (req, reply) => {
    const mp = await req.file();
    if (!mp) return reply.status(400).send({ error: "Missing file (multipart/form-data field name: file)" });

    const buf = await mp.toBuffer();
    const text = buf.toString("utf-8");
    const rows = parseCsv(text);
    if (rows.length < 2) return reply.status(400).send({ error: "CSV vide" });

    const headers = rows[0].map(h => h.toLowerCase());
    const idx = (name: string) => headers.indexOf(name);

    const entrepriseId = req.user.entrepriseId;
    let created = 0;

    for (const r of rows.slice(1)) {
      const nom = r[idx("nom")] || "";
      if (!nom) continue;

      const client = (idx("client") >= 0 ? r[idx("client")] : undefined) || undefined;
      const adresse = (idx("adresse") >= 0 ? r[idx("adresse")] : undefined) || undefined;

      const montantRaw = (idx("montantmarche") >= 0 ? r[idx("montantmarche")] : (idx("montant") >= 0 ? r[idx("montant")] : "")) || "";
      const montantMarche = montantRaw ? Number(montantRaw.replace(",", ".")) : undefined;

      const statut = (idx("statut") >= 0 ? r[idx("statut")] : undefined) || undefined;

      await prisma.chantier.create({
        data: { entrepriseId, nom, client, adresse, montantMarche: Number.isFinite(montantMarche) ? montantMarche : undefined, statut }
      });
      created++;
    }

    return { ok: true, created };
  });
}
