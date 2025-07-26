import Script from 'next/script';
import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Hero173 = (props) => {
  return (
    <>
      <div className="hero173-header78">
        <div className="hero173-column thq-section-padding thq-section-max-width">
          <div className="hero173-content1">
            <h1 className="hero173-text1 thq-heading-1">
              {props.heading1 ?? (
                <Fragment>
                  <span className="hero173-text6">Welcome to our Website!</span>
                </Fragment>
              )}
            </h1>
            <p className="hero173-text2 thq-body-large">
              {props.content1 ?? (
                <Fragment>
                  <span className="hero173-text7">
                    Discover the best products and services tailored just for
                    you.
                  </span>
                </Fragment>
              )}
            </p>
          </div>
          <div className="hero173-actions">
            <button className="thq-button-filled hero173-button1">
              <span className="thq-body-small">
                {props.action1 ?? (
                  <Fragment>
                    <span className="hero173-text5">Explore Now</span>
                  </Fragment>
                )}
              </span>
            </button>
            <button className="thq-button-outline hero173-button2">
              <span className="thq-body-small">
                {props.action2 ?? (
                  <Fragment>
                    <span className="hero173-text8">Learn More</span>
                  </Fragment>
                )}
              </span>
            </button>
          </div>
        </div>
        <div className="hero173-content2">
          <div className="hero173-row-container1 thq-mask-image-horizontal thq-animated-group-container-horizontal">
            <div className="thq-animated-group-horizontal">
              <img
                alt={props.image1Alt}
                src={props.image1Src}
                className="hero173-placeholder-image10 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image2Alt}
                src={props.image2Src}
                className="hero173-placeholder-image11 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image3Alt}
                src={props.image3Src}
                className="hero173-placeholder-image12 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image4Alt}
                src={props.image4Src}
                className="hero173-placeholder-image13 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image5Alt}
                src={props.image5Src}
                className="hero173-placeholder-image14 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image6Alt}
                src={props.image6Src}
                className="hero173-placeholder-image15 thq-img-scale thq-img-ratio-1-1"
              />
            </div>
            <div className="thq-animated-group-horizontal">
              <img
                alt={props.image1Alt}
                src={props.image1Src}
                className="hero173-placeholder-image16 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image2Alt}
                src={props.image2Src}
                className="hero173-placeholder-image17 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image3Alt}
                src={props.image3Src}
                className="hero173-placeholder-image18 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image4Alt}
                src={props.image4Src}
                className="hero173-placeholder-image19 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image5Alt}
                src={props.image5Src}
                className="hero173-placeholder-image20 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt="Hero Image"
                src="https://images.unsplash.com/photo-1534312527009-56c7016453e6?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDIxfHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&amp;ixlib=rb-4.0.3&amp;w=1500"
                className="hero173-placeholder-image21 thq-img-scale thq-img-ratio-1-1"
              />
            </div>
          </div>
          <div className="hero173-row-container2 thq-mask-image-horizontal thq-animated-group-container-horizontal">
            <div className="thq-animated-group-horizontal-reverse">
              <img
                alt={props.image7Alt}
                src={props.image7Src}
                className="hero173-placeholder-image22 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image8Alt}
                src={props.image8Src}
                className="hero173-placeholder-image23 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image9Alt}
                src={props.image9Src}
                className="hero173-placeholder-image24 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image10Alt}
                src={props.image10Src}
                className="hero173-placeholder-image25 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image11Alt}
                src={props.image11Src}
                className="hero173-placeholder-image26 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image12Alt}
                src={props.image12Src}
                className="hero173-placeholder-image27 thq-img-scale thq-img-ratio-1-1"
              />
            </div>
            <div className="thq-animated-group-horizontal-reverse">
              <img
                alt={props.image7Alt}
                src={props.image7Src}
                className="hero173-placeholder-image28 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image8Alt}
                src={props.image8Src}
                className="hero173-placeholder-image29 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image9Alt}
                src={props.image9Src}
                className="hero173-placeholder-image30 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image10Alt}
                src={props.image10Src}
                className="hero173-placeholder-image31 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt={props.image11Alt}
                src={props.image11Src}
                className="hero173-placeholder-image32 thq-img-scale thq-img-ratio-1-1"
              />
              <img
                alt="Hero Image"
                src="https://images.unsplash.com/photo-1568214379698-8aeb8c6c6ac8?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDEyfHxncmFmaWN8ZW58MHx8fHwxNzE1Nzk0OTk5fDA&amp;ixlib=rb-4.0.3&amp;w=1500"
                className="hero173-placeholder-image33 thq-img-scale thq-img-ratio-1-1"
              />
            </div>
          </div>
        </div>
        <div>
          <div className="hero173-container2">
            <Script
              html={`<style>
  @keyframes scroll-x {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(calc(-100% - 16px));
    }
  }

  @keyframes scroll-y {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(calc(-100% - 16px));
    }
  }
</style>
`}
            ></Script>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .hero173-header78 {
            gap: var(--dl-layout-space-threeunits);
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            position: relative;
            align-items: center;
            flex-shrink: 0;
            flex-direction: column;
          }
          .hero173-column {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: auto;
            display: flex;
            align-items: center;
            flex-direction: column;
            padding-bottom: var(--dl-layout-space-unit);
          }
          .hero173-content1 {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            align-self: stretch;
            align-items: center;
            flex-direction: column;
          }
          .hero173-text1 {
            text-align: center;
          }
          .hero173-text2 {
            text-align: center;
          }
          .hero173-actions {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-items: flex-start;
            padding-top: var(--dl-layout-space-unit);
          }
          .hero173-content2 {
            gap: var(--dl-layout-space-oneandhalfunits);
            width: 100%;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .hero173-row-container1 {
            width: 100%;
          }
          .hero173-placeholder-image10 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image11 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image12 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image13 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image14 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image15 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image16 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image17 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image18 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image19 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image20 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image21 {
            width: 400px;
            height: 400px;
          }
          .hero173-row-container2 {
            width: 100%;
          }
          .hero173-placeholder-image22 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image23 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image24 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image25 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image26 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image27 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image28 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image29 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image30 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image31 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image32 {
            width: 400px;
            height: 400px;
          }
          .hero173-placeholder-image33 {
            width: 400px;
            height: 400px;
          }
          .hero173-container2 {
            display: contents;
          }
          .hero173-text5 {
            display: inline-block;
          }
          .hero173-text6 {
            display: inline-block;
          }
          .hero173-text7 {
            display: inline-block;
          }
          .hero173-text8 {
            display: inline-block;
          }
          @media (max-width: 767px) {
            .hero173-content2 {
              width: 100%;
            }
          }
          @media (max-width: 479px) {
            .hero173-actions {
              width: 100%;
              flex-direction: column;
            }
            .hero173-button1 {
              width: 100%;
            }
            .hero173-button2 {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Hero173.defaultProps = {
  image4Alt: 'Hero Image',
  action1: undefined,
  image7Alt: 'Hero Image',
  image1Src:
    'https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDJ8fGFic3RyYWN0fGVufDB8fHx8MTcxMDg3MDkzMHww&ixlib=rb-4.0.3&w=1500',
  image3Src:
    'https://images.unsplash.com/photo-1574169208507-84376144848b?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDN8fGFic3RyYWN0fGVufDB8fHx8MTcxMDg3MDkzMHww&ixlib=rb-4.0.3&w=1500',
  image9Alt: 'Hero Image',
  image10Src:
    'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDI0fHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image9Src:
    'https://images.unsplash.com/photo-1506259091721-347e791bab0f?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDExfHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image5Src:
    'https://images.unsplash.com/photo-1604076913837-52ab5629fba9?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDh8fGFic3RyYWN0fGVufDB8fHx8MTcxMDg3MDkzMHww&ixlib=rb-4.0.3&w=1500',
  image6Alt: 'Hero Image',
  image8Src:
    'https://images.unsplash.com/photo-1557672172-298e090bd0f1?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDEwfHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  heading1: undefined,
  image4Src:
    'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDV8fGFic3RyYWN0fGVufDB8fHx8MTcxMDg3MDkzMHww&ixlib=rb-4.0.3&w=1500',
  image5Alt: 'Hero Image',
  image7Src:
    'https://images.unsplash.com/photo-1561212044-bac5ef688a07?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDIyfHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image12Alt: 'Hero Image',
  image3Alt: 'Hero Image',
  image12Src:
    'https://images.unsplash.com/photo-1568214379698-8aeb8c6c6ac8?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDEyfHxncmFmaWN8ZW58MHx8fHwxNzE1Nzk0OTk5fDA&ixlib=rb-4.0.3&w=1500',
  image11Src:
    'https://images.unsplash.com/photo-1524169358666-79f22534bc6e?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDI3fHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image2Src:
    'https://images.unsplash.com/photo-1552083974-186346191183?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDE1fHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image8Alt: 'Hero Image',
  content1: undefined,
  image11Alt: 'Hero Image',
  image2Alt: 'Hero Image',
  image6Src:
    'https://images.unsplash.com/photo-1534312527009-56c7016453e6?ixid=M3w5MTMyMXwwfDF8c2VhcmNofDIxfHxhYnN0cmFjdHxlbnwwfHx8fDE3MTA4NzA5MzB8MA&ixlib=rb-4.0.3&w=1500',
  image1Alt: 'Hero Image',
  image10Alt: 'Hero Image',
  action2: undefined,
}

Hero173.propTypes = {
  image4Alt: PropTypes.string,
  action1: PropTypes.element,
  image7Alt: PropTypes.string,
  image1Src: PropTypes.string,
  image3Src: PropTypes.string,
  image9Alt: PropTypes.string,
  image10Src: PropTypes.string,
  image9Src: PropTypes.string,
  image5Src: PropTypes.string,
  image6Alt: PropTypes.string,
  image8Src: PropTypes.string,
  heading1: PropTypes.element,
  image4Src: PropTypes.string,
  image5Alt: PropTypes.string,
  image7Src: PropTypes.string,
  image12Alt: PropTypes.string,
  image3Alt: PropTypes.string,
  image12Src: PropTypes.string,
  image11Src: PropTypes.string,
  image2Src: PropTypes.string,
  image8Alt: PropTypes.string,
  content1: PropTypes.element,
  image11Alt: PropTypes.string,
  image2Alt: PropTypes.string,
  image6Src: PropTypes.string,
  image1Alt: PropTypes.string,
  image10Alt: PropTypes.string,
  action2: PropTypes.element,
}

export default Hero173
