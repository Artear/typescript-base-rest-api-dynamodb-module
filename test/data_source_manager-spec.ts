import {DataSource} from "../src/data_source/base/DataSource";
import {DataSourceManager} from "../src/data_source/base/DataSourceManager";
import * as sinon from "sinon";
import {expect} from "chai";
import Dictionary from "typescript-collections/dist/lib/Dictionary";
import {InternalServerError, NotFoundError} from "restify-errors";
import {ElasticSearchDataSource} from "../src/data_source/elastic/ElasticSearchDatasource";
import {elasticResponseMock} from "./mocks/elasticSearchResponseMock";


class DummySource implements DataSource {

    getItems(keys: Array<string>, fields?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            let promises = keys.map(
                id => this.getData(id).then((data) => {
                        return data;
                    }
                ).catch((err) => {
                    // item not found
                    reject(err);
                })
            );
            Promise.all(promises).then(function (items) {
                resolve(items.filter(Boolean));
            });
        });
    }

    private values: Dictionary<String, any> = new Dictionary<String, any>();

    getData(key: string): Promise<any> {
        return new Promise((resolve) => {
            resolve(this.values.getValue(key));
        });
    }

    putData(key: string, value: any): Promise<any> {
        return new Promise((resolve) => {
            this.values.setValue(key, value);
            resolve({"itemId": key});
        });
    }

    updateDataRaw(params: any): Promise<any> {
        return;
    }

    updateData(key: string, value: Object): Promise<any> {
        return this.putData(key, value);
    }

    filterData(field: string, value: string): Promise<any> {
        throw Error("Operation not supported!");
    }

    searchData(query: Object): Promise<any> {
        return new Promise((resolve, reject) => resolve(null));
    }

    deleteItem(key: string): Promise<any> {
        return new Promise((resolve) => {
            this.values.remove(key);
            resolve(true);
        });
    }
}

describe("DataSourceManager Test", function () {

    it("Should get data from a Data Source", (done: Function) => {
        const key = "some_key";
        const dummy_data = "dummy_data";
        const dummySource = new DummySource();

        sinon.stub(dummySource, "getData").callsFake(function (key: string) {
            return new Promise((resolve) => {
                resolve(dummy_data);
            });
        });

        let manager: DataSourceManager = new DataSourceManager(dummySource);
        manager.getData(key).then((data) => {
            expect(data).to.be.equal(dummy_data);
            done();
        });
    });

    it("Should get an array of data from a Data Source", (done: Function) => {
        const keys = ["some_key", "other_key"];
        const dummy_data = ["dummy_data", "dummy_data"];
        const dummySource = new DummySource();

        sinon.stub(dummySource, "getItems").callsFake(function (key: string) {
            return new Promise((resolve) => {
                resolve(dummy_data);
            });
        });

        let manager: DataSourceManager = new DataSourceManager(dummySource);
        manager.getItems(keys).then((data) => {
            expect(data).to.be.equal(dummy_data);
            done();
        });
    });

    it("Should call 2 Sources and stop", function (done: Function) {
        const key = "some_key";
        const dummy_data = "dummy_data";
        const emptySource = new DummySource();
        const dummySource = new DummySource();
        const throwSource = new DummySource();

        sinon.stub(emptySource, "getData").callsFake(function (key: string) {
            return new Promise((resolve) => {
                resolve(null);
            });
        });

        sinon.stub(dummySource, "getData").callsFake(function (key: string) {
            return new Promise((resolve) => {
                resolve(dummy_data);
            });
        });

        sinon.stub(throwSource, "getData").callsFake(function (key: string) {
            throw new Error("Shouldn't be calling this");
        });

        let manager: DataSourceManager = new DataSourceManager(emptySource, dummySource, throwSource);
        manager.getData(key).then((data) => {
            expect(data).to.equal(dummy_data);
            done();
        });
    });

    it("Should get data from the last slavesource to update the main", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();
        const slaveSource2 = new DummySource();
        const slaveSource3 = new DummySource();
        const slaveSource4 = new DummySource();

        sinon.stub(slaveSource4, "getData").callsFake(() => {
            return new Promise((resolve) => {
                resolve(dummy_data);
            });
        });

        let manager: DataSourceManager = new DataSourceManager(mainSource, slaveSource1, slaveSource2, slaveSource3, slaveSource4);
        manager.getData(key).then((data) => {
            expect(data).to.be.equal(dummy_data);
            done();
        });
    });

    it("Should get error when the resource is empty", function (done: Function) {
        const key = "some_key";
        const mainSource = new DummySource();

        let manager: DataSourceManager = new DataSourceManager(mainSource);
        manager.getData(key).catch((data) => {
            expect(data.message).to.be.equal("Resource not found");
            done();
        });
    });

    it("Should get the exists items when an item of the data array not exists", function (done: Function) {
        const keys = ["exists_key", "exists_key_2", "not_found_key"];
        const successContent = [{"exists_key": "dummy_info"}, {"exists_key_2": "dummy_info"}];
        const mainSource = new DummySource();
        const externalSource = new DummySource();

        sinon.stub(mainSource, "getItems").callsFake(function (keys: Array<string>) {
            return new Promise((resolve, reject) => {
                resolve([successContent]);
            });
        });

        sinon.stub(externalSource, "getItems").callsFake(function (keys: Array<string>) {
            return new Promise((resolve, reject) => {
                reject("Not content");
            });
        });

        let manager: DataSourceManager = new DataSourceManager(mainSource, externalSource);
        manager.getItems(keys).then((data) => {
            expect(data[0]).equal(successContent);
            done();
        });
    });

    it("Should fail when not exists all items in the sources", function (done: Function) {
        const keys = ["not_exists_key", "not_exists_key_2"];
        const mainSource = new DummySource();
        const externalSource = new DummySource();

        sinon.stub(mainSource, "getItems").callsFake(function (keys: Array<string>) {
            return new Promise((resolve, reject) => {
                reject("Not content");
            });
        });

        sinon.stub(externalSource, "getItems").callsFake(function (keys: Array<string>) {
            return new Promise((resolve, reject) => {
                reject("Not content");
            });
        });

        let manager: DataSourceManager = new DataSourceManager(mainSource, externalSource);
        manager.getItems(keys).catch((data) => {
            expect(data).equal("Not content");
            done();
        });
    });

    it("Should get array of data from the last slavesource to update the main", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();
        const slaveSource2 = new DummySource();
        const slaveSource3 = new DummySource();
        const slaveSource4 = new DummySource();

        sinon.stub(slaveSource4, "getData").callsFake(() => {
            return new Promise((resolve) => {
                resolve(dummy_data);
            });
        });

        let manager: DataSourceManager =
            new DataSourceManager(mainSource, slaveSource1, slaveSource2, slaveSource3, slaveSource4);
        manager.getItems([key]).then((data) => {
            expect(data[0]).to.be.equal(dummy_data);
            done();
        });
    });

    it("Should insert data in the main datasource", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();

        let manager: DataSourceManager =
            new DataSourceManager(mainSource, slaveSource1);
        manager.putData(key, dummy_data).then((data) => {
            expect(data.itemId).to.equal(key);
            done();
        });
    });

    it("Should update exist data in the main datasource", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();

        let manager: DataSourceManager =
            new DataSourceManager(mainSource, slaveSource1);
        manager.putData(key, dummy_data).then((data) => {
            manager.updateData(key, dummy_data).then((data) => {
                expect(data.itemId).to.equal(key);
                done();
            });
        });
    });

    it("Should failed if update fail on main datasource", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();
        sinon.stub(mainSource, "putData").callsFake(() => {
            return new Promise((resolve, reject) => {
                reject(new InternalServerError());
            });
        });
        let manager: DataSourceManager =
            new DataSourceManager(mainSource, slaveSource1);
        manager.putData(key, dummy_data).catch((err) => {
            expect(err).instanceOf(InternalServerError);
            done();
        });
    });

    it("Should failed if getData fail on main datasource", function (done: Function) {
        const key = "some_key";
        const dummy_data = "slaveSource4";
        const mainSource = new DummySource();
        const slaveSource1 = new DummySource();
        sinon.stub(mainSource, "getData").callsFake(() => {
            return new Promise((resolve, reject) => {
                reject(new InternalServerError());
            });
        });
        let manager: DataSourceManager =
            new DataSourceManager(mainSource, slaveSource1);
        manager.getData(key, dummy_data).catch((err) => {
            expect(err).instanceOf(InternalServerError);
            done();
        });
    });

    it("Should return search result from elasticsearch ", (done) => {
        const mainSource = new DummySource();
        const elastic = new ElasticSearchDataSource();
        sinon.stub(elastic, "searchData").callsFake(() => {
            return new Promise((resolve, reject) => {
                resolve(elasticResponseMock);
            });
        });
        new DataSourceManager(mainSource, elastic).searchData("TN-").then((data) => {
            done();
        });
    });

    it("Should delete data from a Data Source", (done: Function) => {
        const key = "dummy_key";
        const dummySource = new DummySource();
        const dummyDeleteResponse = "dummy_source_response";

        sinon.stub(dummySource, "deleteItem").callsFake(function (key: string) {
            return new Promise((resolve) => {
                resolve(dummyDeleteResponse);
            });
        });

        let manager: DataSourceManager = new DataSourceManager(dummySource);
        manager.deleteItem(key).then((data) => {
            expect(data).to.be.equal(dummyDeleteResponse);
            done();
        });
    });
});
