# Nachherbeleg der freigegebenen Quellenkorrektur

Native Rücklesung nach der einzelnen erfolgreichen Transaktion. Vorherwerte wurden vor dem Schreiben in Git gesichert. Die genaue Nachherbindung für den Rückweg und die unverändert gebliebenen Reservierungen stehen unten.

```json
{
  "version": 1,
  "status": "executed_and_native_read_back",
  "executedSqlSha256": "fbadae1b22385dbe63665f9aa1d1c8c086d2ffea92103316829d3696ee6e6691",
  "checked_at": "2026-11-07T10:28:14.755153+00:00",
  "beforeCommit": "e7bfe1688e26e13487a2139404060c06162d85d8",
  "counts": {
    "rawUpdated": 4,
    "newOfficialSource": 1,
    "reviewedKnowledgeObjects": 5,
    "parkedKnowledgeObjects": 2,
    "sourceLinkReplacements": 1,
    "providerCallsByThisCorrection": 0
  },
  "knowledgeObjects": [
    {
      "id": "ko-vg-bundestages-20261105-c4c8fe",
      "row_sha256": "d13f98c467f2a7002d284dc55190a14fb41de5dfffe0d3fd7fe69c8d04f13bfb",
      "ko_version": 2,
      "status": "neu",
      "understanding_status": "complete",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-infrastrukturbeschleunig-20261028-7081d4",
      "row_sha256": "2c0656ce9905bc4c044d757343ded47339a8c9eccde1863bda8a34af2173a5f1",
      "ko_version": 2,
      "status": "neu",
      "understanding_status": "complete",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-öffentliche-20260529-0b6720",
      "row_sha256": "8664a13c6ae87a6730dc2881061454bc40dd056f4fd836900703d3fea8c54c3f",
      "ko_version": 2,
      "status": "pending",
      "understanding_status": "failed",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-öffentliche-20260529-0b6720-2",
      "row_sha256": "d0054d44f642e12f46778b7ec34614fa32163f747f5a5c178af5e79c5282b5fc",
      "ko_version": 2,
      "status": "pending",
      "understanding_status": "failed",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-pflegebetrug-20261104-becc2d",
      "row_sha256": "0a7099ddf3f2072e0b7831064f517bdcf9546a0276a2ea47fa5f753fa61221fe",
      "ko_version": 2,
      "status": "neu",
      "understanding_status": "complete",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-pflegegesetz-20261105-ede54f",
      "row_sha256": "a1498b185188927262621ed518ff68ea194bd86fc11fb20ed481f2446b4903f8",
      "ko_version": 2,
      "status": "neu",
      "understanding_status": "complete",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    },
    {
      "id": "ko-vg-pflegereform-20261105-b189ff",
      "row_sha256": "88df83300425b72de135032df3b4ecd00ed5d53ad2d7d3c9d3a0336b25ea2fa8",
      "ko_version": 2,
      "status": "neu",
      "understanding_status": "complete",
      "updated_at": "2026-11-07T10:27:28.698649+00:00"
    }
  ],
  "sources": [
    {
      "id": "rd-25dafbdc7b9afb0ffa35e0d75608f7bb8c2c100d9195862929428ec67af8616c",
      "row_sha256": "ac5731a7e542c943ac61b923df1253ed8b9ce51ca78a85aecc4498c7f589b2d6"
    },
    {
      "id": "rd-26bf0f7a1aa2ca3addc62e8c7385daf005a2b392cfc5c462c1b1fcead843b653",
      "row_sha256": "ab7df933432d36a6ccee881f5b84f02b6e84d8201cd24e6fbfad45aa6cb58f1a"
    },
    {
      "id": "rd-4d615e8e738c50b6a12772b7701267d3ad2fa6d3ec2ae6c50a3771e31e214ca5",
      "row_sha256": "9ea7d9d2751915f025369d00708d9b65be853ba4b8606c7f1e58f4cd4d7eae63"
    },
    {
      "id": "rd-abe2c9a6e146b7dd37785c5a06ce7f6e8a46f8d6bfaf0f5333220a7130110ce8",
      "row_sha256": "9814e50e7ce7b93894526a545f8ae8a33746205d19b6fa34e2814b558e6b9bc6"
    },
    {
      "id": "rd-c298f6df6f15b3ce9cf0c0bfdcdf9f8be51dfbdb86fc8ffbb0e834ff88cdefca",
      "row_sha256": "f81b772210753ea43f89581b3cc6aad83846edec6a565fbabacda7b2c34c713e"
    }
  ],
  "linksAfter": [
    {
      "created_at": "2026-11-07T10:27:28.695916+00:00",
      "raw_document_id": "rd-26bf0f7a1aa2ca3addc62e8c7385daf005a2b392cfc5c462c1b1fcead843b653",
      "knowledge_object_id": "ko-vg-bundestages-20261105-c4c8fe"
    },
    {
      "created_at": "2026-11-06T04:01:58.38933+00:00",
      "raw_document_id": "rd-abe2c9a6e146b7dd37785c5a06ce7f6e8a46f8d6bfaf0f5333220a7130110ce8",
      "knowledge_object_id": "ko-vg-infrastrukturbeschleunig-20261028-7081d4"
    },
    {
      "created_at": "2026-11-06T08:33:33.190327+00:00",
      "raw_document_id": "rd-1f16e13544dd741b9d00646718e5d503c6da57e1ea47824ff3d193df45bc5dee",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720"
    },
    {
      "created_at": "2026-11-06T08:33:33.190327+00:00",
      "raw_document_id": "rd-4f1c092b0c4b98698cfc3937ad73ad0bd1519ee156833293912ad4b142e4324c",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720"
    },
    {
      "created_at": "2026-11-06T08:33:33.190327+00:00",
      "raw_document_id": "rd-abe2c9a6e146b7dd37785c5a06ce7f6e8a46f8d6bfaf0f5333220a7130110ce8",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720"
    },
    {
      "created_at": "2026-11-07T04:01:52.763156+00:00",
      "raw_document_id": "rd-1f16e13544dd741b9d00646718e5d503c6da57e1ea47824ff3d193df45bc5dee",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720-2"
    },
    {
      "created_at": "2026-11-07T04:01:52.763156+00:00",
      "raw_document_id": "rd-4f1c092b0c4b98698cfc3937ad73ad0bd1519ee156833293912ad4b142e4324c",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720-2"
    },
    {
      "created_at": "2026-11-07T04:01:52.763156+00:00",
      "raw_document_id": "rd-abe2c9a6e146b7dd37785c5a06ce7f6e8a46f8d6bfaf0f5333220a7130110ce8",
      "knowledge_object_id": "ko-vg-öffentliche-20260529-0b6720-2"
    },
    {
      "created_at": "2026-11-06T08:33:51.735531+00:00",
      "raw_document_id": "rd-25dafbdc7b9afb0ffa35e0d75608f7bb8c2c100d9195862929428ec67af8616c",
      "knowledge_object_id": "ko-vg-pflegebetrug-20261104-becc2d"
    },
    {
      "created_at": "2026-11-06T00:18:16.337967+00:00",
      "raw_document_id": "rd-43521b89bb5b5ec5947e1cc92c9e5496bb13303a29dde459ab3c21ca710a0c17",
      "knowledge_object_id": "ko-vg-pflegegesetz-20261105-ede54f"
    },
    {
      "created_at": "2026-11-06T00:18:16.337967+00:00",
      "raw_document_id": "rd-c298f6df6f15b3ce9cf0c0bfdcdf9f8be51dfbdb86fc8ffbb0e834ff88cdefca",
      "knowledge_object_id": "ko-vg-pflegegesetz-20261105-ede54f"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-2fa36cbd2f3e0ed26a81f927f181ca666d1e3fad02a0f4bed64031848860f2df",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T08:33:55.460899+00:00",
      "raw_document_id": "rd-4d615e8e738c50b6a12772b7701267d3ad2fa6d3ec2ae6c50a3771e31e214ca5",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-7963e9dd77a652de4514ffa2cfb16b51b07541480f4d731b1c4f78b5c45ee79d",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-7ef95f790df5e09eff11689cfd3554ae411d9fe2c99d558c9de212660a142978",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-8477c3f3961afe7b3414d13e15a6c7379eb8290b346e52fc7bbd10b65f460162",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-97ba15205cd040abf6d1c54517dc6171a71a1d1909ec5c8f534b5f27f8021330",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-98bbf2e652af3c7cfdbdcaf3c8811b10540821b47185347b6f81311b9333cb9e",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T04:02:00.389278+00:00",
      "raw_document_id": "rd-9c70d7b67ed42a22208fbf282684fb9ce7aac5170917d6735d25d056de8c15f0",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T08:33:55.460899+00:00",
      "raw_document_id": "rd-bd1d3ce4e96c88596d1397d115065f0b011334146e1565c58b642f1d52aa7d89",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T00:17:17.877053+00:00",
      "raw_document_id": "rd-e7386e1882276440940be68962b8a8c709efbe92b8aef07055b38b1d6f09d7f0",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    },
    {
      "created_at": "2026-11-06T04:02:00.389278+00:00",
      "raw_document_id": "rd-ece235965f511048f004755e2657a0963ca74ef40cca1315db883cb76dac12f6",
      "knowledge_object_id": "ko-vg-pflegereform-20261105-b189ff"
    }
  ],
  "reservations": [
    {
      "fencing": 2,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "1206a8f651616c600d916fb6484396ab0dd33cc4d1f78d3c0684c2e86213e036",
      "vorgang_id": "vg-bundestages-20261105-c4c8fe"
    },
    {
      "fencing": 1,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "e121c0b365b1a620a93749226a5131c1c351b0738c8e72ec30da8b3fc6ca1b3e",
      "vorgang_id": "vg-infrastrukturbeschleunig-20261028-7081d4"
    },
    {
      "fencing": 1,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "0c65f998b58da57ef63bf192e7a18959db6dd2fcbda661eaefa11a60e4a2f845",
      "vorgang_id": "vg-öffentliche-20260529-0b6720"
    },
    {
      "fencing": 1,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "8caba3f289384a1aec70461b6404b20babcc24317aeb3b04bb129f88b4867fab",
      "vorgang_id": "vg-öffentliche-20260529-0b6720-2"
    },
    {
      "fencing": 1,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "f7b6e2a7da93623d036cde37f93dca79d471a5065dfb9443f9f40a89bbcd714f",
      "vorgang_id": "vg-pflegebetrug-20261104-becc2d"
    },
    {
      "fencing": 2,
      "zustand": "fertig",
      "lease_bis": null,
      "row_sha256": "0379cfb57f8ba3443aa5c45d2e002d2b991410b52fda459fdbee8ae660d4c537",
      "vorgang_id": "vg-pflegegesetz-20261105-ede54f"
    },
    {
      "fencing": 3,
      "zustand": "unbekannt",
      "lease_bis": null,
      "row_sha256": "00b69f6993cb5eb7fcc2555dd5076fe6e13e2218d48378bf0eee1864e6e783d6",
      "vorgang_id": "vg-pflegereform-20261105-b189ff"
    }
  ],
  "unchangedRP": {
    "id": "ko-vg-schulbesuche-20261105-26a829",
    "row_sha256": "b4415cfb27a1f66bef41fce9a584e0248b59791790444a88275a91f5862a0076"
  },
  "rollback": {
    "preimage": "quellenkorrektur-20261107-vorher.md",
    "rules": [
      "Zuerst Zielreservierungen sperren; ungeänderte Hashes und keine aktive Lease verlangen",
      "Alle sieben KO und vier geänderten Rohzeilen anhand dieser Nachherhashes sperren und auf exakte Übereinstimmung prüfen",
      "Aktuelle Ziel Links müssen genau linksAfter entsprechen; Abweichung beendet den Rückweg ohne Mutation",
      "Nur die im Vorherdokument gesicherten geänderten Felder und ursprünglichen updated_at wiederherstellen; verstehen_fencing und Reservierungen niemals schreiben",
      "Neue CO2 Kante entfernen und alte CO2 Kante samt ursprünglichem created_at wiederherstellen",
      "Amtliche neue Rohquelle nur entfernen, wenn ihr Nachherhash stimmt und nach Entfernen der eigenen Kante keine fremde Kante verbleibt; andernfalls erhalten",
      "Eine einzelne atomare Transaktion; bei Fehler vollständig zurückrollen"
    ]
  },
  "limitations": [
    "Kein authentifizierter Production Browsertest",
    "Keine neue Berechnung bestehender Briefings",
    "HELMUT_ARTIKELKONTEXT nicht aktiviert",
    "RP Original weiterhin nicht abrufbar",
    "Historischer unbekannt Ausgang der Pflegereform Reservierung bleibt unverändert"
  ]
}
```
