import { FakeStorageProvider } from "../../infrastructure/storage/fake/FakeStorageProvider";
import { runStorageContract } from "../contract/storageProvider.contract";

runStorageContract("fake", () => new FakeStorageProvider());
