// cspell:locale es,en: the fixtures carry the Spanish half of each pair.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import {
  educationProperties,
  localizedValues,
  membershipRoles,
  schoolNode,
  SCHOOLS,
} from "./person-schema.mjs";

const pair = (en, es) => ({ en, es });

test("localizedValues puts English first", () => {
  assert.deepEqual(localizedValues(pair("Yes", "Sí")), [
    { "@value": "Yes", "@language": "en" },
    { "@value": "Sí", "@language": "es" },
  ]);
});

test("every study is a dated alumniOf Role; only finished ones are credentials", () => {
  const { alumniOf, hasCredential } = educationProperties([
    {
      school: "upv",
      name: pair("PhD program (discontinued)", "Doctorado (no finalizado)"),
      startDate: "2019",
      endDate: "2023",
    },
    {
      school: "ua",
      name: pair("Degree", "Grado"),
      endDate: "2018",
      credential: {
        name: pair("Engineer", "Ingeniero"),
        category: "degree",
        eqfLevel: 6,
      },
    },
    {
      school: "ies-berlanga",
      name: pair("Sound technician", "Técnico de sonido"),
      endDate: "2011",
      credential: { category: "vocational degree", eqfLevel: 5 },
    },
  ]);
  assert.equal(alumniOf.length, 3);
  assert.deepEqual(alumniOf[0], {
    "@type": "OrganizationRole",
    alumniOf: SCHOOLS.upv,
    roleName: localizedValues(
      pair("PhD program (discontinued)", "Doctorado (no finalizado)"),
    ),
    startDate: "2019",
    endDate: "2023",
  });
  assert.equal("startDate" in alumniOf[1], false);

  assert.equal(
    hasCredential.length,
    2,
    "the unfinished study has no credential",
  );
  const [degree, vocational] = hasCredential;
  assert.deepEqual(degree.name, localizedValues(pair("Engineer", "Ingeniero")));
  assert.equal(degree.dateCreated, "2018");
  assert.equal(degree.educationalLevel.termCode, "6");
  assert.equal(
    degree.recognizedBy,
    SCHOOLS.ua,
    "a university awards its own degrees",
  );
  assert.deepEqual(
    vocational.name,
    localizedValues(pair("Sound technician", "Técnico de sonido")),
    "defaults to the study's name",
  );
  assert.equal(
    "recognizedBy" in vocational,
    false,
    "a vocational title is not the school's to award",
  );
});

test("an unknown school is an error, not a silent omission", () => {
  assert.throws(() => schoolNode("nowhere"), /unknown school "nowhere"/);
  assert.throws(() => schoolNode("toString"), /unknown school/);
});

test("membershipRoles states the organization, the role and its years", () => {
  const [role] = membershipRoles([
    {
      organization: {
        name: "AmicroTech",
        alternateName: "AµTech",
        description: pair("Association", "Asociación"),
      },
      roleName: pair("Founder", "Fundador"),
      startDate: "2016",
      endDate: "2018",
    },
  ]);
  assert.equal(role["@type"], "OrganizationRole");
  assert.equal(role.memberOf.name, "AmicroTech");
  assert.equal(role.memberOf.alternateName, "AµTech");
  assert.equal("url" in role.memberOf, false);
  assert.deepEqual(role.roleName, localizedValues(pair("Founder", "Fundador")));
  assert.equal(role.endDate, "2018");
});

test("the real profile/about.yaml names only known schools", () => {
  const about = loadYaml(
    readFileSync(
      join(import.meta.dirname, "../../src/content/profile/about.yaml"),
      "utf8",
    ),
  );
  const { alumniOf, hasCredential } = educationProperties(
    about.person.education,
  );
  assert.equal(alumniOf.length, about.person.education.length);
  assert.ok(hasCredential.length > 0);
});
