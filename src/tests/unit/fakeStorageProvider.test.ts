import { FakeStorageProvider } from "../../dao/fake/FakeStorageProvider";
import { runStorageContract } from "../contract/storageProvider.contract";

runStorageContract("fake", () => new FakeStorageProvider());
