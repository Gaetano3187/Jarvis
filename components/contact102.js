import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Contact102 = (props) => {
  return (
    <>
      <div className="contact102-container1 thq-section-padding">
        <div className="contact102-max-width thq-section-max-width">
          <div className="contact102-content1 thq-flex-row">
            <div className="contact102-content2">
              <h2 className="thq-heading-2">
                {props.heading1 ?? (
                  <Fragment>
                    <span className="contact102-text21">Locations</span>
                  </Fragment>
                )}
              </h2>
              <p className="thq-body-large">
                {props.content1 ?? (
                  <Fragment>
                    <span className="contact102-text19">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in ero.
                    </span>
                  </Fragment>
                )}
              </p>
            </div>
          </div>
          <div className="contact102-content3 thq-flex-row">
            <div className="contact102-container2">
              <img
                alt={props.location1ImageAlt}
                src={props.location1ImageSrc}
                className="contact102-image1 thq-img-ratio-16-9"
              />
              <h3 className="contact102-text12 thq-heading-3">
                {props.location1 ?? (
                  <Fragment>
                    <span className="contact102-text17">Bucharest</span>
                  </Fragment>
                )}
              </h3>
              <p className="thq-body-large">
                {props.location1Description ?? (
                  <Fragment>
                    <span className="contact102-text20">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in ero.
                    </span>
                  </Fragment>
                )}
              </p>
              <div className="contact102-container3">
                <a
                  href="https://example.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="thq-body-small thq-button-flat"
                >
                  Get directions
                </a>
              </div>
            </div>
            <div className="contact102-container4">
              <img
                alt={props.location2ImageAlt}
                src={props.location2ImageSrc}
                className="contact102-image2 thq-img-ratio-16-9"
              />
              <h3 className="contact102-text14 thq-heading-3">
                {props.location2 ?? (
                  <Fragment>
                    <span className="contact102-text18">Cluj - Napoca</span>
                  </Fragment>
                )}
              </h3>
              <p className="thq-body-large">
                {props.location2Description ?? (
                  <Fragment>
                    <span className="contact102-text16">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in ero.
                    </span>
                  </Fragment>
                )}
              </p>
              <div className="contact102-container5">
                <a
                  href="https://example.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="thq-body-small thq-button-flat"
                >
                  Get directions
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .contact102-container1 {
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact102-max-width {
            align-self: center;
          }
          .contact102-content1 {
            width: 100%;
            margin-bottom: var(--dl-layout-space-threeunits);
            justify-content: flex-start;
          }
          .contact102-content2 {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-self: stretch;
            align-items: flex-start;
            flex-direction: column;
          }
          .contact102-content3 {
            width: 100%;
            align-items: flex-start;
            flex-direction: row;
            justify-content: space-between;
          }
          .contact102-container2 {
            gap: var(--dl-layout-space-oneandhalfunits);
            flex: 1;
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .contact102-image1 {
            object-fit: cover;
          }
          .contact102-text12 {
            text-align: center;
          }
          .contact102-container3 {
            flex: 0 0 auto;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
          .contact102-container4 {
            gap: var(--dl-layout-space-oneandhalfunits);
            flex: 1;
            display: flex;
            align-items: center;
            flex-direction: column;
          }
          .contact102-image2 {
            object-fit: cover;
          }
          .contact102-text14 {
            text-align: center;
          }
          .contact102-container5 {
            flex: 0 0 auto;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
          .contact102-text16 {
            display: inline-block;
          }
          .contact102-text17 {
            display: inline-block;
          }
          .contact102-text18 {
            display: inline-block;
          }
          .contact102-text19 {
            display: inline-block;
          }
          .contact102-text20 {
            display: inline-block;
          }
          .contact102-text21 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .contact102-content1 {
              align-items: flex-start;
              justify-content: flex-start;
            }
            .contact102-content3 {
              position: relative;
              align-items: center;
              flex-direction: column;
            }
          }
          @media (max-width: 767px) {
            .contact102-content1 {
              gap: var(--dl-layout-space-oneandhalfunits);
            }
            .contact102-image1 {
              width: 100%;
            }
            .contact102-image2 {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Contact102.defaultProps = {
  location2Description: undefined,
  location1ImageAlt: 'image1Alt',
  location1: undefined,
  location2: undefined,
  location2ImageSrc:
    'https://images.unsplash.com/photo-1571979195097-59d223315d89?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDMxfHxidWNoYXJlc3R8ZW58MHx8fHwxNzE2Mjg2MzE3fDA&ixlib=rb-4.0.3&w=1400',
  content1: undefined,
  location1ImageSrc:
    'https://images.unsplash.com/photo-1588694926280-3ae414d06ccb?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDEzfHxjbHVqfGVufDB8fHx8MTcxNjI4NjI4N3ww&ixlib=rb-4.0.3&w=1400',
  location1Description: undefined,
  heading1: undefined,
  location2ImageAlt: 'image2Alt',
}

Contact102.propTypes = {
  location2Description: PropTypes.element,
  location1ImageAlt: PropTypes.string,
  location1: PropTypes.element,
  location2: PropTypes.element,
  location2ImageSrc: PropTypes.string,
  content1: PropTypes.element,
  location1ImageSrc: PropTypes.string,
  location1Description: PropTypes.element,
  heading1: PropTypes.element,
  location2ImageAlt: PropTypes.string,
}

export default Contact102
