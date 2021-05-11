const fetch = require('cross-fetch');
const { ApolloClient, InMemoryCache, gql, useQuery, HttpLink, ApolloLink, from } = require('@apollo/client');
const { createPersistedQueryLink } = require('@apollo/client/link/persisted-queries');
const { sha256 } = require('crypto-hash');

const url = 'https://www.mediamarkt.de/api/v1/graphql';
//const url = 'http://localhost:5555/graphql'

const persistedQueriesLink = createPersistedQueryLink({ sha256 });
const httpLink = new HttpLink({ uri: url, fetch, useGETForQueries: true });

const activityMiddleware = new ApolloLink((operation, forward) => {
    // add the recent-activity custom header to the headers
    operation.extensions = {
        pwa: {
            salesLine: "Media",
            country: "DE",
            language: "de"
        }
    };
    operation.setContext(({ headers = {} }) => ({
        headers: {
            ...headers,
            'Accept-Language': 'de,en-US;q=0.7,en;q=0.3',
            'user-agent': "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:88.0) Gecko/20100101 Firefox/88.0",
            'x-flow-id': uuidv4(),
            'apollographql-client-name': 'pwa-client',
            'apollographql-client-version': "7.12.0",
        }
    }));

    return forward(operation);
})

const client = new ApolloClient({
    link: from([
        activityMiddleware,
        persistedQueriesLink.concat(httpLink)
    ]),
    cache: new InMemoryCache(),
});

const query = client
    .query({
        query: gql`
        query GetProductCollectionItems($items: [ProductCollectionItemInput!]!, $storeId: String) {
            getProductCollectionItems(items: $items) {
                visible {
                    __typename
                    ... on GraphqlCampaignProductCollectionProduct {
                        ...ProductCollectionProduct
                    }
                    ... on GraphqlCampaignProductCollectionBundle {
                        ...ProductCollectionBundle
                    }
                    ... on GraphqlCampaignProductCollectionTeaser {
                        ...ProductCollectionTeaser
                    }
                }
            }
        }`,
        variables: {
            items: [
                {
                    id: "2683228",
                    type: "Product",
                    priceOverride: null
                }
            ]
        }
    }).then((res) => {
        console.log(res)
    })

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}