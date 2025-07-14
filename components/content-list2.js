import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const ContentList2 = (props) => {
  return (
    <>
      <div className="content-list2-container thq-section-padding">
        <div className="content-list2-max-width thq-flex-column thq-section-max-width">
          <div className="content-list2-content10 thq-flex-column">
            <ul>
              <li className="content-list2-li1 thq-flex-column list-item">
                <h2 className="content-list2-heading1 thq-heading-2">
                  {props.heading1 ?? (
                    <Fragment>
                      <span className="content-list2-text23">
                        Welcome to Our Landing Page
                      </span>
                    </Fragment>
                  )}
                </h2>
                <p className="content-list2-content1 thq-body-small">
                  {props.content1 ?? (
                    <Fragment>
                      <span className="content-list2-text16">
                        Discover the latest trends and updates in our industry.
                      </span>
                    </Fragment>
                  )}
                </p>
                <ul className="content-list2-ul2 thq-flex-column">
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading2 ?? (
                        <Fragment>
                          <span className="content-list2-text14">About Us</span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content2 ?? (
                        <Fragment>
                          <span className="content-list2-text22">
                            Learn more about our company&apos;s mission and
                            values.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading3 ?? (
                        <Fragment>
                          <span className="content-list2-text15">
                            Our Services
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content3 ?? (
                        <Fragment>
                          <span className="content-list2-text24">
                            Explore the range of services we offer to meet your
                            needs.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading4 ?? (
                        <Fragment>
                          <span className="content-list2-text25">
                            Why Choose Us
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content4 ?? (
                        <Fragment>
                          <span className="content-list2-text20">
                            Find out what sets us apart from the competition.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading5 ?? (
                        <Fragment>
                          <span className="content-list2-text13">
                            Client Testimonials
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content5 ?? (
                        <Fragment>
                          <span className="content-list2-text12">
                            Read what our satisfied clients have to say about
                            us.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading6 ?? (
                        <Fragment>
                          <span className="content-list2-text26">
                            Contact Us
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content6 ?? (
                        <Fragment>
                          <span className="content-list2-text10">
                            Get in touch with our team for any inquiries or
                            collaborations.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
          <div className="content-list2-content11 thq-flex-column">
            <ul>
              <li className="content-list2-li7 thq-flex-column list-item">
                <h2 className="content-list2-heading7 thq-heading-2">
                  {props.heading7 ?? (
                    <Fragment>
                      <span className="content-list2-text18">
                        Subscribe to Our Newsletter
                      </span>
                    </Fragment>
                  )}
                </h2>
                <p className="content-list2-content7 thq-body-small">
                  {props.content7 ?? (
                    <Fragment>
                      <span className="content-list2-text21">
                        Stay updated with our latest news and promotions by
                        subscribing.
                      </span>
                    </Fragment>
                  )}
                </p>
                <ul className="content-list2-ul4 thq-flex-column">
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading8 ?? (
                        <Fragment>
                          <span className="content-list2-text17">
                            Join Our Team
                          </span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content2 ?? (
                        <Fragment>
                          <span className="content-list2-text22">
                            Learn more about our company&apos;s mission and
                            values.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                  <li className="list-item">
                    <h3 className="thq-heading-3">
                      {props.heading9 ?? (
                        <Fragment>
                          <span className="content-list2-text19">FAQs</span>
                        </Fragment>
                      )}
                    </h3>
                    <p className="thq-body-small">
                      {props.content9 ?? (
                        <Fragment>
                          <span className="content-list2-text11">
                            Find answers to commonly asked questions about our
                            products and services.
                          </span>
                        </Fragment>
                      )}
                    </p>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .content-list2-container {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
          }
          .content-list2-max-width {
            width: 100%;
            display: flex;
            max-width: var(--dl-layout-size-maxwidth);
            align-items: center;
            flex-direction: column;
          }
          .content-list2-content10 {
            align-self: stretch;
            align-items: flex-start;
          }
          .content-list2-li1 {
            align-items: flex-start;
          }
          .content-list2-heading1 {
            align-self: flex-start;
          }
          .content-list2-content1 {
            align-self: flex-start;
            margin-bottom: var(--dl-layout-space-halfunit);
          }
          .content-list2-ul2 {
            align-items: flex-start;
            padding-left: var(--dl-layout-space-fiveunits);
          }
          .content-list2-content11 {
            align-self: stretch;
            align-items: flex-start;
          }
          .content-list2-li7 {
            align-items: flex-start;
          }
          .content-list2-heading7 {
            align-self: flex-start;
          }
          .content-list2-content7 {
            margin-bottom: var(--dl-layout-space-halfunit);
          }
          .content-list2-ul4 {
            align-items: flex-start;
            padding-left: var(--dl-layout-space-fiveunits);
          }
          .content-list2-text10 {
            display: inline-block;
          }
          .content-list2-text11 {
            display: inline-block;
          }
          .content-list2-text12 {
            display: inline-block;
          }
          .content-list2-text13 {
            display: inline-block;
          }
          .content-list2-text14 {
            display: inline-block;
          }
          .content-list2-text15 {
            display: inline-block;
          }
          .content-list2-text16 {
            display: inline-block;
          }
          .content-list2-text17 {
            display: inline-block;
          }
          .content-list2-text18 {
            display: inline-block;
          }
          .content-list2-text19 {
            display: inline-block;
          }
          .content-list2-text20 {
            display: inline-block;
          }
          .content-list2-text21 {
            display: inline-block;
          }
          .content-list2-text22 {
            display: inline-block;
          }
          .content-list2-text23 {
            display: inline-block;
          }
          .content-list2-text24 {
            display: inline-block;
          }
          .content-list2-text25 {
            display: inline-block;
          }
          .content-list2-text26 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .content-list2-ul2 {
              padding-left: var(--dl-layout-space-threeunits);
            }
            .content-list2-ul4 {
              padding-left: var(--dl-layout-space-threeunits);
            }
          }
          @media (max-width: 479px) {
            .content-list2-ul2 {
              padding-left: var(--dl-layout-space-oneandhalfunits);
            }
            .content-list2-ul4 {
              padding-left: var(--dl-layout-space-oneandhalfunits);
            }
          }
        `}
      </style>
    </>
  )
}

ContentList2.defaultProps = {
  content6: undefined,
  content9: undefined,
  content5: undefined,
  heading5: undefined,
  heading2: undefined,
  heading3: undefined,
  content1: undefined,
  heading8: undefined,
  heading7: undefined,
  heading9: undefined,
  content4: undefined,
  content7: undefined,
  content2: undefined,
  heading1: undefined,
  content3: undefined,
  heading4: undefined,
  heading6: undefined,
}

ContentList2.propTypes = {
  content6: PropTypes.element,
  content9: PropTypes.element,
  content5: PropTypes.element,
  heading5: PropTypes.element,
  heading2: PropTypes.element,
  heading3: PropTypes.element,
  content1: PropTypes.element,
  heading8: PropTypes.element,
  heading7: PropTypes.element,
  heading9: PropTypes.element,
  content4: PropTypes.element,
  content7: PropTypes.element,
  content2: PropTypes.element,
  heading1: PropTypes.element,
  content3: PropTypes.element,
  heading4: PropTypes.element,
  heading6: PropTypes.element,
}

export default ContentList2
